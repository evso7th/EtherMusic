

import * as Tone from 'tone';
import type { MelodyInstrument, MusicKey, MusicScale } from '@/app/page';
import { LatchEngine } from './latch-engine';
import { DrumMachine } from './drum-machine';
import { OrbManager } from './orb-manager';

export type InstrumentType = 'melody' | 'bass' | 'latch' | 'autopilot_melody' | 'autopilot_accompaniment' | 'autopilot_bass' | 'autopilot_effect';

// A "Voice" represents a single synthesizer and its current state.
class Voice {
    public synth: Tone.Synth;
    public isBusy = false;
    public activePointerId: number | null = null;
    public instrumentType: InstrumentType | null = null;
    public releaseTime = 0;

    constructor() {
        this.synth = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 },
        });
    }

    isAvailable(): boolean {
        return !this.isBusy;
    }
    
    // Applies a preset and connects to the correct channel
    configure(preset: any, channel: Tone.Channel) {
        this.synth.set(preset);
        this.synth.disconnect();
        this.synth.connect(channel);
    }
    
    attack(freq: number, vel: number, pointerId: number | null, type: InstrumentType) {
        this.isBusy = true;
        this.activePointerId = pointerId;
        this.instrumentType = type;
        this.synth.triggerAttack(freq, undefined, vel);
    }

    release(duration?: Tone.Unit.Time) {
        if (duration) {
            this.releaseTime = Tone.now() + new Tone.Time(duration).toSeconds();
            this.synth.triggerRelease(this.releaseTime);
            Tone.Transport.scheduleOnce(() => {
                this.isBusy = false;
                this.activePointerId = null;
                this.instrumentType = null;
            }, this.releaseTime);
        } else {
            this.synth.triggerRelease();
            this.isBusy = false;
            this.activePointerId = null;
            this.instrumentType = null;
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
    private readonly MAX_VOICES = 18; 
    private presets: { [key in InstrumentType]: any } = {};

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
        console.log(`AudioEngine initialized with a pool of ${this.MAX_VOICES} voices.`);
    }

    // --- Core Voice Management ---
    private getVoice(pointerId: number | null = null, instrumentType: InstrumentType | null = null): Voice | null {
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

        // If no voices are free, try to steal one (voice stealing)
        // For now, we just return null if no voice is available. A more advanced
        // implementation could steal the oldest or quietest voice.
        return null;
    }
    
    // --- Theremin Interaction ---

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const quantizedFreq = this.getClosestFrequency(freq, type);
        const instrumentType = type === 'melody' ? 'melody' : 'manualBass';

        if (type === 'bass' && this.isBassLatchOn) {
            this.latchEngine.handleInteraction(pos, vol, quantizedFreq);
            return;
        }
        
        const voice = this.getVoice(null, instrumentType);
        if (voice) {
            const channel = type === 'melody' ? this.channels.melody : this.channels.manualBass;
            voice.configure(this.presets[instrumentType], channel);
            voice.attack(quantizedFreq, vol*vol, pointerId, instrumentType);
            this.orbManager.addOrb(pointerId, type, pos.x, pos.y);
        }
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const voice = this.getVoice(pointerId);
        if (voice) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            voice.synth.frequency.rampTo(quantizedFreq, 0.01);
            voice.synth.volume.rampTo(Tone.gainToDb(vol * vol), 0.01);
            this.orbManager.updateOrb(pointerId, pos.x, pos.y);
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        if (this.isBassLatchOn && type === 'bass') return;

        const voice = this.getVoice(pointerId);
        if (voice) {
            voice.release();
            this.orbManager.removeOrb(pointerId);
        }
    }
    
    public playAutopilotEvent(note: {type: InstrumentType, freq: number | number[], dur: Tone.Unit.Time, vel: number}) {
        if (!this.isInitialized || note.type.startsWith('autopilot') === false) return;
        
        // --- DEFENSIVE CHECK ---
        // Ensure the frequency is a valid number before proceeding.
        if (typeof note.freq !== 'number' || !isFinite(note.freq)) {
            return;
        }

        const voice = this.getVoice(null, note.type);
        if (!voice) {
            return; 
        }

        const channel = note.type === 'autopilot_effect' ? this.channels.effects : this.channels.autopilot;
        voice.configure(this.presets[note.type], channel);
        
        voice.attack(note.freq, note.vel, null, note.type);
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
        this.presets.autopilot_melody = { ...this.presets.autopilot_melody, ...newOptions };
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
        const voice = this.getVoice(null, 'latch');
        if (voice) {
            voice.configure(this.presets.latch, this.channels.latch);
            voice.attack(freq, vol, null, 'latch');
        }
        return voice;
    }
    
    public releaseLatchVoice(voice: Voice) {
        voice.release();
    }


    // --- Private Helpers ---
    private createPresets() {
        this.presets = {
            melody: { portamento: 0.02, oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 } },
            manualBass: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 }},
            bass: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 }},
            latch: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 0.8 }},
            autopilot_melody: { oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 } },
            autopilot_accompaniment: { oscillator: { type: 'triangle' }, envelope: { attack: 0.2, decay: 0.9, sustain: 0.1, release: 1.0 }, volume: -8 },
            autopilot_bass: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, filter: { Q: 5, type: 'lowpass', rolloff: -24 }, envelope: { attack: 0.01, decay: 1.4, sustain: 0.1, release: 2 }, filterEnvelope: { attack: 0.01, decay: 0.7, sustain: 0, release: 0, baseFrequency: 200, octaves: 1.5 } },
            autopilot_effect: { oscillator: { type: 'fmsine', modulationType: 'sine', harmonicity: 0.8 }, envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 0 } },
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
            Tone.Transport.stop();
            // Don't cancel transport events, as the worker manages its own time
            this.stopAllSounds();
        }
    }
}
