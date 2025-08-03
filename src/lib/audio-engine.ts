

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';
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
    public synth: any; // Can be Tone.Synth or Tone.FMSynth etc.
    public isBusy = false;
    public activePointerId: number | null = null;
    public instrumentType: InstrumentType | null = null;
    private releaseEventId: Tone.ToneEventId | null = null;

    constructor() {
        // We start with a generic synth. It will be replaced by configure().
        this.synth = new Tone.Synth();
    }

    isAvailable(): boolean {
        // A voice is available if it's not busy.
        return !this.isBusy;
    }
    
    // Applies a preset and connects to the correct channel
    configure(preset: any, channel: Tone.Channel) {
        // Dispose of the old synth to prevent memory leaks
        if (this.synth) {
            this.synth.dispose();
        }

        if (preset.type === 'FMSynth') {
            this.synth = new Tone.FMSynth(preset.options).connect(channel);
        } else if (preset.type === 'AMSynth') {
            this.synth = new Tone.AMSynth(preset.options).connect(channel);
        } else if (preset.type === 'Vibrato') {
            this.synth = new Tone.Synth({
                oscillator: {
                    type: 'vibrato',
                    frequency: 4,
                    depth: 0.1,
                } as any, // Cast to any to handle custom oscillator type
                envelope: preset.options.envelope
            }).connect(channel);
        } else { // Default to standard Synth
            this.synth = new Tone.Synth(preset.options).connect(channel);
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

    release(duration: Tone.Unit.Time = 0) {
        if (this.isBusy) {
            const releaseStartTime = Tone.now() + new Tone.Time(duration).toSeconds();
            this.synth.triggerRelease(releaseStartTime);

            if (this.releaseEventId) {
                Tone.Transport.clear(this.releaseEventId);
            }
            
            const releaseTime = new Tone.Time(this.synth.envelope.release).toSeconds();
            const releaseEndTime = releaseStartTime + releaseTime + 0.05; // Add 50ms buffer

            this.releaseEventId = Tone.Transport.scheduleOnce(() => {
                this.isBusy = false;
                this.activePointerId = null;
                this.instrumentType = null;
                this.releaseEventId = null;
            }, releaseEndTime);
        }
    }

    attackRelease(freq: number, dur: Tone.Unit.Time, time: number, vel: number, type: InstrumentType) {
        if (this.releaseEventId) {
            Tone.Transport.clear(this.releaseEventId);
        }
        this.isBusy = true;
        this.activePointerId = null; 
        this.instrumentType = type;

        this.synth.triggerAttackRelease(freq, dur, time, vel);
        
        const totalDuration = new Tone.Time(dur).toSeconds() + new Tone.Time(this.synth.envelope.release).toSeconds();

        this.releaseEventId = Tone.Transport.scheduleOnce(() => {
            this.isBusy = false;
            this.instrumentType = null;
            this.releaseEventId = null;
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
    private presets: { [key: string]: any } = {};

    private allowedFrequencies = { bass: [] as number[], melody: [] as number[] };
    private isBassLatchOn = false;
    private currentMelodyInstrument: Instrument = 'theremin';
    private currentBassInstrument: Instrument = 'synth';
    
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
        
        if (type === 'bass' && this.isBassLatchOn) {
            this.latchEngine.handleInteraction(pos, vol, quantizedFreq);
            return;
        }
        
        const voice = this.getVoice();
        if (voice) {
            const time = Tone.now();
            const channel = type === 'melody' ? this.channels.melody : this.channels.manualBass;
            const instrumentName = type === 'melody' ? this.currentMelodyInstrument : this.currentBassInstrument;
            
            const presetKey = `${instrumentName}_${type}`;
            let preset = this.presets[presetKey];
            
            // If there's no type-specific preset (e.g. 'glass_bass'), fall back to the generic one (e.g. 'glass')
            if (!preset) {
                preset = this.presets[instrumentName];
            }

            if (preset) {
                voice.configure(preset, channel);
                voice.attack(quantizedFreq, vol*vol, time, pointerId, type);
                this.orbManager.addOrb(pointerId, type, pos.x, pos.y);
            }
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
            voice.release(0.1); // Give a short release for manual notes
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

        // Determine the preset based on the autopilot part
        let preset;
        if (note.type === 'autopilot_melody' || note.type === 'autopilot_accompaniment') {
            const presetKey = `${this.currentMelodyInstrument}_melody`; // Autopilot melody/accomp follows melody pad instrument
            preset = this.presets[presetKey] || this.presets[this.currentMelodyInstrument];
        } else {
             preset = this.presets[note.type];
        }

        if (!preset) {
            console.warn(`AudioEngine: No preset for instrument type "${note.type}"`);
            return;
        }
        
        const channel = note.type.startsWith('autopilot_effect') ? this.channels.effects : this.channels.autopilot;
        
        voice.configure(preset, channel);
        voice.attackRelease(note.freq, note.dur, time, note.vel, note.type);
    }

    public stopAllSounds() {
        this.voicePool.forEach(voice => voice.release(0.1));
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
    
    public setMelodyInstrument(instrument: Instrument) {
        this.currentMelodyInstrument = instrument;
    }

    public setBassInstrument(instrument: Instrument) {
        this.currentBassInstrument = instrument;
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
            const presetKey = `${this.currentBassInstrument}_bass`;
            const preset = this.presets[presetKey] || this.presets[this.currentBassInstrument];

            if (preset) {
                voice.configure(preset, this.channels.latch);
                voice.attack(freq, vol, time, null, 'latch');
            }
        }
        return voice;
    }
    
    public releaseLatchVoice(voice: Voice) {
        voice.release(0.5); // Give a gentle release for latched notes
    }


    // --- Private Helpers ---
    private createPresets() {
        this.presets = {
            synth: { type: 'Synth', options: { oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 } } },
            organ: {
                type: 'Synth',
                options: {
                    oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                    envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 1.2 }
                }
            },
            theremin: { type: 'Synth', options: { oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 } } },
            mellotron: {
                type: 'Vibrato',
                options: {
                    envelope: { attack: 0.2, decay: 0.1, sustain: 0.8, release: 0.5, attackCurve: 'exponential' }
                }
            },
            ebass: {
                type: 'FMSynth',
                options: {
                    harmonicity: 1,
                    modulationIndex: 3.5,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 },
                    modulation: { type: 'square' },
                    modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 }
                }
            },
            glass_melody: {
                type: 'FMSynth',
                options: {
                    harmonicity: 1.4,
                    modulationIndex: 20,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 },
                    modulation: { type: 'square' },
                    modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 }
                }
            },
            glass_bass: {
                type: 'FMSynth',
                options: {
                    harmonicity: 1.4,
                    modulationIndex: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.01, decay: 1.5, sustain: 0.05, release: 2.5 },
                    modulation: { type: 'square' },
                    modulationEnvelope: { attack: 0.01, decay: 1.0, sustain: 0, release: 1.0 }
                }
            },
            // Autopilot presets
            autopilot_bass: {
                type: 'Synth',
                options: {
                    oscillator: { type: "fmsine", harmonicity: 0.5 },
                    filter: { Q: 1, type: 'lowpass', rolloff: -12 },
                    envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 1.2 },
                    filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 1, baseFrequency: 200, octaves: 1.5 }
                }
            },
            // Effect presets
            autopilot_effect_star: { type: 'FMSynth', options: { oscillator: { type: 'fmsine', modulationType: 'sine', harmonicity: 0.8 }, envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 0.5 } } },
            autopilot_effect_meteor: { type: 'NoiseSynth', options: { noise: { type: 'white' }, filter: { type: 'bandpass', Q: 15 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2, attackCurve: 'exponential' } } },
            autopilot_effect_warp: { type: 'NoiseSynth', options: { noise: { type: 'pink', playbackRate: 0.2 }, filter: { type: 'lowpass', Q: 2 }, envelope: { attack: 0.5, decay: 0.8, sustain: 0.1, release: 1 } } },
            autopilot_effect_hole: { type: 'AMSynth', options: { oscillator: { type: 'amsine', harmonicity: 0.2 }, envelope: { attack: 2, decay: 2, sustain: 0, release: 1 } } },
            autopilot_effect_pulsar: { type: 'Synth', options: { oscillator: { type: 'pwm', modulationFrequency: 0.2 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.2 } } },
            autopilot_effect_nebula: { type: 'Synth', options: { oscillator: { type: 'fatsawtooth', count: 5, spread: 80 }, envelope: { attack: 1.5, decay: 2, sustain: 0.5, release: 2 } } },
            autopilot_effect_comet: { type: 'Synth', options: { oscillator: { type: 'pulse', width: 0.1 }, envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.8 } } },
            autopilot_effect_wind: { type: 'NoiseSynth', options: { noise: { type: 'brown' }, filter: { type: 'bandpass', Q: 8 }, envelope: { attack: 2, decay: 5, sustain: 0.1, release: 3 } } },
            autopilot_effect_echoes: { type: 'Synth', options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.5 } } },
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
