

import * as Tone from 'tone';
import type { MelodyInstrument, MusicKey, MusicScale } from '@/app/page';
import { LatchEngine } from './latch-engine';
import { DrumMachine } from './drum-machine';
import { OrbManager } from './orb-manager';

export type InstrumentType = 
    'melody' | 
    'bass' | 
    'latch' | 
    'autopilot_melody' | 
    'autopilot_accompaniment' | 
    'autopilot_bass' |
    'autopilot_effect_star' |
    'autopilot_effect_meteor' |
    'autopilot_effect_warp' |
    'autopilot_effect_hole' |
    'autopilot_effect_pulsar' |
    'autopilot_effect_nebula' |
    'autopilot_effect_comet' |
    'autopilot_effect_wind' |
    'autopilot_effect_echoes';


// A "Voice" represents a single synthesizer and its current state.
class Voice {
    public synth: Tone.Synth | Tone.PolySynth;
    public isBusy = false;
    public activePointerId: number | null = null;
    public instrumentType: InstrumentType | null = null;
    private releaseEventId: Tone.ToneEventId | null = null;
    private isMellotron = false;

    constructor() {
        // A generic synth configuration. It will be reconfigured on the fly.
        this.synth = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 },
        });
    }

    isAvailable(): boolean {
        // A voice is available if it's not busy.
        return !this.isBusy;
    }
    
    // Applies a preset and connects to the correct channel
    configure(preset: any, channel: Tone.Channel, instrument: MelodyInstrument | null = null, mellotronLFO: Tone.LFO | null) {
        this.synth.set(preset);
        this.synth.disconnect(); // Important to disconnect before connecting to a new channel
        this.synth.connect(channel);

        // Disconnect from LFO if it was previously connected
        if (this.isMellotron && mellotronLFO) {
            // @ts-ignore
             mellotronLFO.disconnect(this.synth.detune);
        }

        this.isMellotron = instrument === 'mellotron';
        
        // Connect to the shared LFO if the instrument is mellotron
        if (this.isMellotron && mellotronLFO) {
            // @ts-ignore
            mellotronLFO.connect(this.synth.detune);
        }
    }
    
    attack(freq: number, vel: number, time: number | undefined, pointerId: number | null, type: InstrumentType) {
        if (this.releaseEventId) {
            Tone.Transport.clear(this.releaseEventId);
            this.releaseEventId = null;
        }
        this.isBusy = true;
        this.activePointerId = pointerId;
        this.instrumentType = type;
        this.synth.triggerAttack(freq, time, vel);
    }

    release(duration: Tone.Unit.Time = 0, mellotronLFO: Tone.LFO | null) {
        if (this.isBusy) {
            const releaseStartTime = Tone.now() + new Tone.Time(duration).toSeconds();
            this.synth.triggerRelease(releaseStartTime);

            if (this.releaseEventId) {
                Tone.Transport.clear(this.releaseEventId);
            }
            
            // @ts-ignore
            const releaseTime = new Tone.Time(this.synth.envelope.release).toSeconds();
            const releaseEndTime = releaseStartTime + releaseTime + 0.05; // Add 50ms buffer

            this.releaseEventId = Tone.Transport.scheduleOnce(() => {
                this.isBusy = false;
                this.activePointerId = null;
                this.instrumentType = null;
                this.releaseEventId = null;

                // Disconnect from the LFO after the note has finished
                if (this.isMellotron && mellotronLFO) {
                    // @ts-ignore
                    mellotronLFO.disconnect(this.synth.detune);
                    this.isMellotron = false;
                }
            }, releaseEndTime);
        }
    }

    attackRelease(freq: number, dur: Tone.Unit.Time, time: number, vel: number, type: InstrumentType, mellotronLFO: Tone.LFO | null) {
        if (this.releaseEventId) {
            Tone.Transport.clear(this.releaseEventId);
        }
        this.isBusy = true;
        this.activePointerId = null; 
        this.instrumentType = type;

        const isAPMellotron = (type === 'autopilot_melody' || type === 'autopilot_accompaniment') && this.isMellotron;

        if (isAPMellotron && mellotronLFO) {
            // @ts-ignore
            mellotronLFO.connect(this.synth.detune);
        }

        this.synth.triggerAttackRelease(freq, dur, time, vel);
        
        // @ts-ignore
        const totalDuration = new Tone.Time(dur).toSeconds() + new Tone.Time(this.synth.envelope.release).toSeconds();

        this.releaseEventId = Tone.Transport.scheduleOnce(() => {
            this.isBusy = false;
            this.instrumentType = null;
            this.releaseEventId = null;
            if (isAPMellotron && mellotronLFO) {
                // @ts-ignore
                mellotronLFO.disconnect(this.synth.detune);
            }
        }, time + totalDuration);
    }
    
    dispose() {
        if (this.releaseEventId) {
            Tone.Transport.clear(this.releaseEventId);
        }
        this.synth.dispose();
    }
}


export class AudioEngine {
    public isInitialized = false;
    private orbManager: OrbManager;
    public drumMachine!: DrumMachine;
    private latchEngine!: LatchEngine;

    public channels!: {
        [key: string]: Tone.Channel
    };
    public fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };
    
    // --- The Unified Voice Pool ---
    private voicePool: Voice[] = [];
    private readonly MAX_VOICES = 18; // Total voices for the entire app
    private presets: { [key in InstrumentType]?: any } = {};

    private allowedFrequencies = { bass: [] as number[], melody: [] as number[] };
    private isBassLatchOn = false;
    private currentMelodyInstrument: MelodyInstrument = 'theremin';
    
    // --- Optimizations ---
    private mellotronLFO: Tone.LFO | null = null;

    constructor(orbManager: OrbManager) {
        this.orbManager = orbManager;
    }

    public async initialize() {
        if (this.isInitialized) return;
        await Tone.start();

        // Master FX
        this.fx = {
            reverb: new Tone.Reverb({ decay: 8, wet: 1 }).toDestination(),
            delay: new Tone.FeedbackDelay("8n", 0.5).toDestination(),
        };

        // Master Channels
        this.channels = {
            melody: new Tone.Channel(-6),
            manualBass: new Tone.Channel(-6),
            latch: new Tone.Channel(-15),
            drums: new Tone.Channel(-9),
            autopilot: new Tone.Channel(-10),
            effects: new Tone.Channel(-6),
        };
        
        for (const channel of Object.values(this.channels)) {
            channel.connect(this.fx.reverb);
            channel.connect(this.fx.delay);
            channel.toDestination();
        }

        // --- Create Global LFO for Mellotron ---
        this.mellotronLFO = new Tone.LFO({
            frequency: 0.2,
            type: "sine",
            min: -5,
            max: 5,
        }).start();


        this.createPresets();
        
        // --- Create the Unified Voice Pool ---
        for (let i = 0; i < this.MAX_VOICES; i++) {
            this.voicePool.push(new Voice());
        }
        
        this.latchEngine = new LatchEngine(this, this.orbManager);
        
        this.drumMachine = new DrumMachine(this.channels.drums);
        await this.drumMachine.initialize();
        
        const recorder = new Tone.Recorder();
        Tone.getDestination().connect(recorder);
        
        this.isInitialized = true;
        console.log(`AudioEngine initialized with a unified pool of ${this.MAX_VOICES} voices.`);
    }

    // --- Core Voice Management ---
    private getVoice(pointerId: number | null = null): Voice | null {
        // First, check for a voice with the same pointerId (for note updates)
        if (pointerId !== null) {
            const existing = this.voicePool.find(v => v.activePointerId === pointerId);
            if (existing) return existing;
        }

        // Find the first available voice
        let voice = this.voicePool.find(v => v.isAvailable());
        if (voice) {
            return voice;
        }
        
        // Voice stealing could be implemented here if needed, but for now, we just return null.
        console.warn("No available voices in the pool.");
        return null;
    }
    
    // --- Theremin Interaction ---

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        if (!this.isInitialized) return;
        const quantizedFreq = this.getClosestFrequency(freq, type);
        const instrumentType = type === 'melody' ? 'melody' : 'manualBass';

        if (type === 'bass' && this.isBassLatchOn) {
            this.latchEngine.handleInteraction(pos, vol, quantizedFreq);
            return;
        }
        
        const voice = this.getVoice();
        if (voice) {
            const time = Tone.now();
            const channel = type === 'melody' ? this.channels.melody : this.channels.manualBass;
            const instrument = type === 'melody' ? this.currentMelodyInstrument : null;
            voice.configure(this.presets[instrumentType], channel, instrument, this.mellotronLFO);
            voice.attack(quantizedFreq, vol*vol, time, pointerId, instrumentType);
            this.orbManager.addOrb(pointerId, type, pos.x, pos.y);
        }
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        if (!this.isInitialized) return;
        const voice = this.getVoice(pointerId);
        if (voice) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            // @ts-ignore
            voice.synth.frequency.rampTo(quantizedFreq, 0.01);
            // @ts-ignore
            voice.synth.volume.rampTo(Tone.gainToDb(vol * vol), 0.01);
            this.orbManager.updateOrb(pointerId, pos.x, pos.y);
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        if (!this.isInitialized) return;
        if (this.isBassLatchOn && type === 'bass') return;

        const voice = this.getVoice(pointerId);
        if (voice) {
            voice.release(0.1, this.mellotronLFO); // Give a short release for manual notes
            this.orbManager.removeOrb(pointerId);
        }
    }
    
    public playAutopilotEvent(note: {type: InstrumentType, freq: number, dur: Tone.Unit.Time, vel: number}, time: number) {
         if (!this.isInitialized || note.freq === null || note.freq === undefined) {
             return;
        }

        const voice = this.getVoice();
        if (!voice) {
            return; 
        }

        const preset = this.presets[note.type];
        if (!preset) {
            console.warn(`AudioEngine: No preset for instrument type "${note.type}"`);
            return;
        }
        
        const channel = note.type.startsWith('autopilot_effect') ? this.channels.effects : this.channels.autopilot;
        const instrument = (note.type === 'autopilot_melody' || note.type === 'autopilot_accompaniment') ? this.currentMelodyInstrument : null;

        voice.configure(preset, channel, instrument, this.mellotronLFO);
        voice.attackRelease(note.freq, note.dur, time, note.vel, note.type, this.mellotronLFO);
    }

    public stopAllSounds() {
        this.voicePool.forEach(voice => voice.release(0.1, this.mellotronLFO));
        this.orbManager.removeAllOrbs('melody');
        this.orbManager.removeAllOrbs('bass');
        this.latchEngine.stopAll();
        this.drumMachine.stop();
    }
    
    // --- Setters ---
    
    public setTempo(bpm: number) {
        Tone.Transport.bpm.value = bpm;
    }

    public setVolumes(volumes: Record<string, number>) {
        this.channels.melody.volume.value = volumes.melody;
        this.channels.manualBass.volume.value = volumes.manualBass;
        this.channels.latch.volume.value = volumes.latch;
        this.channels.drums.volume.value = volumes.drums;
        this.channels.autopilot.volume.value = volumes.autopilot;
        this.channels.effects.volume.value = volumes.effects;
    }

    public setEffects(effects: Record<string, { reverb: number, delay: number }>) {
        for (const key in this.channels) {
            if (effects[key]) {
                this.channels[key].send('reverb', effects[key].reverb);
                this.channels[key].send('delay', effects[key].delay);
            }
        }
    }
    
    public setBeatPattern(patternName: string) {
        this.drumMachine.setBeatPattern(patternName);
    }
    
    public setMelodyInstrument(instrument: MelodyInstrument) {
        this.currentMelodyInstrument = instrument;
        let newOptions;
        switch (instrument) {
            case 'organ': 
                 newOptions = {
                    oscillator: { 
                        type: 'fatsawtooth',
                        count: 2,
                        spread: 30
                    }, 
                    envelope: { attack: 0.1, decay: 0.4, sustain: 0.8, release: 1.5 }
                }; 
                break;
            case 'mellotron':
                newOptions = {
                    oscillator: {
                        type: 'fatsquare',
                        count: 3,
                        spread: 20
                    },
                    envelope: {
                        attack: 0.2,
                        decay: 0.1,
                        sustain: 0.8,
                        release: 0.5,
                        attackCurve: 'exponential'
                    }
                };
                break;
            case 'theremin': newOptions = { oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 }}; break;
            case 'glass': newOptions = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.2 }}; break;
            case 'synth': default: newOptions = { oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 }}; break;
        }
        this.presets.melody = { ...this.presets.melody, ...newOptions };
        this.presets.autopilot_melody = { ...this.presets.autopilot_melody, ...newOptions, portamento: 0.05 };
        this.presets.autopilot_accompaniment = {...this.presets.autopilot_accompaniment, ...newOptions, portamento: 0.01}
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [3, 4, 5]),
        };
        this.latchEngine.setAllowedFrequencies(this.allowedFrequencies.bass);
    }

    public setBassLatch(isLatchOn: boolean) {
        this.isLatchOn = isLatchOn;
        this.latchEngine.setLatch(isLatchOn);
    }
    
    // --- Latch specific methods ---
    public getLatchVoice(freq: number, vol: number): Voice | null {
        const voice = this.getVoice();
        if (voice) {
            const time = Tone.now();
            voice.configure(this.presets.latch!, this.channels.latch, null, null); // Latch doesn't use LFO
            voice.attack(freq, vol, time, null, 'latch');
        }
        return voice;
    }
    
    public releaseLatchVoice(voice: Voice) {
        voice.release(0.5, null); // Give a gentle release for latched notes
    }


    // --- Private Helpers ---
    private createPresets() {
        this.presets = {
            // Manual playing presets
            melody: { portamento: 0.02, oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 } },
            manualBass: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 }},
            latch: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 0.8 }},
            
            // Autopilot presets
            autopilot_bass: {
                oscillator: { type: "fmsine", harmonicity: 0.5 },
                filter: { Q: 1, type: 'lowpass', rolloff: -12 },
                envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 1.2 },
                filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 1, baseFrequency: 200, octaves: 1.5 }
            },
            autopilot_accompaniment: { 
                portamento: 0.01,
                oscillator: { type: 'triangle8' }, 
                envelope: { attack: 0.2, decay: 0.9, sustain: 0.1, release: 1.0 }
            },
            autopilot_melody: { 
                portamento: 0.05,
                oscillator: { type: 'fatsine4', spread: 40, count: 4 }, 
                envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 } 
            },
            
            // Effect presets
            autopilot_effect_star: { oscillator: { type: 'fmsine', modulationType: 'sine', harmonicity: 0.8 }, envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 0.5 } },
            autopilot_effect_meteor: { noise: { type: 'white' }, filter: { type: 'bandpass', Q: 15 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2, attackCurve: 'exponential' } },
            autopilot_effect_warp: { noise: { type: 'pink', playbackRate: 0.2 }, filter: { type: 'lowpass', Q: 2 }, envelope: { attack: 0.5, decay: 0.8, sustain: 0.1, release: 1 } },
            autopilot_effect_hole: { oscillator: { type: 'amsine', harmonicity: 0.2 }, envelope: { attack: 2, decay: 2, sustain: 0, release: 1 } },
            autopilot_effect_pulsar: { oscillator: { type: 'pwm', modulationFrequency: 0.2 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.2 } },
            autopilot_effect_nebula: { oscillator: { type: 'fatsawtooth', count: 5, spread: 80 }, envelope: { attack: 1.5, decay: 2, sustain: 0.5, release: 2 } },
            autopilot_effect_comet: { oscillator: { type: 'pulse', width: 0.1 }, envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.8 } },
            autopilot_effect_wind: { noise: { type: 'brown' }, filter: { type: 'bandpass', Q: 8 }, envelope: { attack: 2, decay: 5, sustain: 0.1, release: 3 } },
            autopilot_effect_echoes: { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.5 } },
        };
    }

    private getScaleFrequencies = (key: MusicKey, scale: MusicScale, octaves: number[]): number[] => {
        const scaleIntervals: { [key in MusicScale]: string[] } = {
            'Major': ['0', '2', '4', '5', '7', '9', '11'], 'Minor': ['0', '2', '3', '5', '7', '8', '10'],
            'Major Pentatonic': ['0', '2', '4', '7', '9'], 'Minor Pentatonic': ['0', '3', '5', '7', '10'],
        };
        let allFrequencies: number[] = [];
        const intervals = scaleIntervals[scale];
        octaves.forEach(octave => {
            intervals.forEach(interval => {
                const note = Tone.Frequency(key + octave).transpose(interval);
                allFrequencies.push(note.toFrequency());
            });
        });
        return allFrequencies.sort((a,b) => a - b);
    };

    private getClosestFrequency(targetFreq: number, type: 'bass' | 'melody'): number {
        const freqs = type === 'bass' ? this.allowedFrequencies.bass : this.allowedFrequencies.melody;
        if (freqs.length === 0) return targetFreq;
        return freqs.reduce((prev, curr) => (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev));
    }
    
    public async setPlaying(isPlaying: boolean) {
        if (!this.isInitialized) return;
        
        if (isPlaying) {
            if (Tone.Transport.state !== 'started') {
                await Tone.start(); // Ensure context is running
                Tone.Transport.start();
                this.latchEngine.startAll();
            }
        } else {
            if (Tone.Transport.state === 'started') {
                Tone.Transport.pause();
                this.latchEngine.pauseAll();
            }
        }
    }

    public stop() {
        if (this.isInitialized) {
            this.stopAllSounds();
            if (Tone.Transport.state !== 'stopped') {
                Tone.Transport.stop();
            }
        }
    }
}
