

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
    public synth: Tone.Synth;
    public isBusy = false;
    public activePointerId: number | null = null;
    public instrumentType: InstrumentType | null = null;
    public releaseTime = 0;

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
    configure(preset: any, channel: Tone.Channel) {
        this.synth.set(preset);
        this.synth.disconnect(); // Important to disconnect before connecting to a new channel
        this.synth.connect(channel);
    }
    
    attack(freq: number, vel: number, time: number, pointerId: number | null, type: InstrumentType) {
        this.isBusy = true;
        this.activePointerId = pointerId;
        this.instrumentType = type;
        this.synth.triggerAttack(freq, time, vel);
    }

    release(duration: Tone.Unit.Time = 0) {
        if (this.isBusy) {
            // Use Tone.Time to correctly calculate the release duration
            const releaseDuration = new Tone.Time(duration).toSeconds() > 0 ? new Tone.Time(duration).toSeconds() : 0.05;
            this.synth.triggerRelease();
            setTimeout(() => {
                this.isBusy = false;
                this.activePointerId = null;
                this.instrumentType = null;
            }, releaseDuration * 1000 + 50);
        }
    }
    
    dispose() {
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
            autopilot: new Tone.Channel(-12),
            effects: new Tone.Channel(-9),
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
            voice.configure(this.presets[instrumentType], channel);
            voice.attack(quantizedFreq, vol*vol, time, pointerId, instrumentType);
            this.orbManager.addOrb(pointerId, type, pos.x, pos.y);
        }
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        if (!this.isInitialized) return;
        const voice = this.getVoice(pointerId);
        if (voice) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            voice.synth.frequency.rampTo(quantizedFreq, 0.01);
            voice.synth.volume.rampTo(Tone.gainToDb(vol * vol), 0.01);
            this.orbManager.updateOrb(pointerId, pos.x, pos.y);
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        if (!this.isInitialized) return;
        if (this.isBassLatchOn && type === 'bass') return;

        const voice = this.getVoice(pointerId);
        if (voice) {
            voice.release();
            this.orbManager.removeOrb(pointerId);
        }
    }
    
    public playAutopilotEvent(note: {type: InstrumentType, freq: number, dur: Tone.Unit.Time, vel: number}) {
        if (!this.isInitialized || note.freq === null || note.freq === undefined) return;

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
        
        voice.configure(preset, channel);
        voice.attack(note.freq, note.vel, Tone.now(), null, note.type);
        voice.release(note.dur);
    }

    public stopAllSounds() {
        this.voicePool.forEach(voice => voice.release());
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
        let newOptions;
        switch (instrument) {
            case 'organ': newOptions = { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.9, release: 0.8 }}; break;
            case 'theremin': newOptions = { oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 }}; break;
            case 'glass': newOptions = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.2 }}; break;
            case 'synth': default: newOptions = { oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 }}; break;
        }
        this.presets.melody = { ...this.presets.melody, ...newOptions };
        this.presets.autopilot_melody = { ...this.presets.autopilot_melody, ...newOptions, portamento: 0.05 };
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [3, 4, 5]),
        };
        this.latchEngine.setAllowedFrequencies(this.allowedFrequencies.bass);
    }

    public setBassLatch(isLatchOn: boolean) {
        this.isBassLatchOn = isLatchOn;
        this.latchEngine.setLatch(isLatchOn);
    }
    
    // --- Latch specific methods ---
    public getLatchVoice(freq: number, vol: number): Voice | null {
        const voice = this.getVoice();
        if (voice) {
            const time = Tone.now();
            voice.configure(this.presets.latch, this.channels.latch);
            voice.attack(freq, vol, time, null, 'latch');
        }
        return voice;
    }
    
    public releaseLatchVoice(voice: Voice) {
        voice.release();
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
                oscillator: { type: "fmsine", harmonicity: 0.8, modulationIndex: 2 },
                filter: { Q: 1, type: 'lowpass', rolloff: -12 },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.8 },
                filterEnvelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.8, baseFrequency: 200, octaves: 1.5 }
            },
            autopilot_accompaniment: { 
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
    
    public start() {
        if (this.isInitialized && Tone.Transport.state !== 'started') {
            Tone.Transport.start();
            this.latchEngine.startAll();
        }
    }

    public pause() {
        if (this.isInitialized && Tone.Transport.state === 'started') {
            Tone.Transport.pause();
            this.latchEngine.pauseAll();
        }
    }

    public stop() {
        if (this.isInitialized) {
            this.stopAllSounds();
            // We stop the transport, which also stops the worker via an event listener in AutopilotEngine
            Tone.Transport.stop();
        }
    }
}
