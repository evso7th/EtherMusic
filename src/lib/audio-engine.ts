
import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';
import { LatchEngine } from './latch-engine';
import { DrumMachine } from './drum-machine';
import type { OrbManager } from './orb-manager';
import type { NoteEvent } from './autopilot-worker';


export type InstrumentPart = 
    | 'melody'
    | 'bass'
    | 'latch'
    | 'autopilot_melody'
    | 'autopilot_accompaniment'
    | 'autopilot_bass'
    | 'autopilot_effects';

// A "Voice" represents a single synthesizer instance. It is configured once and then reused.
class Voice {
    public synth: any; // Can be Tone.Synth, Tone.FMSynth, etc.
    public isBusy = false;
    public activePointerId: number | null = null;
    public part: InstrumentPart;
    private releaseTimeoutId: ReturnType<typeof setTimeout> | null = null;

    constructor(preset: any, channel: Tone.Channel, part: InstrumentPart) {
        this.part = part;
        const options = { ...preset.options };
        
        // Create the synth based on the preset type
        if (preset.type === 'FMSynth') {
            this.synth = new Tone.FMSynth(options).connect(channel);
        } else if (preset.type === 'AMSynth') {
            this.synth = new Tone.AMSynth(options).connect(channel);
        } else if (preset.type === 'NoiseSynth') {
            this.synth = new Tone.NoiseSynth(options).connect(channel);
        } else { // Default to standard Synth
            this.synth = new Tone.Synth(options).connect(channel);
        }
    }
    
    isAvailable(): boolean {
        return !this.isBusy;
    }

    attack(freq: number, vel: number, time: number | undefined, pointerId: number | null) {
        if (this.releaseTimeoutId) clearTimeout(this.releaseTimeoutId);
        this.isBusy = true;
        this.activePointerId = pointerId;
        this.synth.triggerAttack(freq, time, vel);
    }
    
    release(duration: Tone.Unit.Time = 0.1) {
        if (this.isBusy) {
            const releaseStartTime = Tone.now() + new Tone.Time(duration).toSeconds();
            this.synth.triggerRelease(releaseStartTime);

            if (this.releaseTimeoutId) clearTimeout(this.releaseTimeoutId);
            
            const releaseTimeMs = new Tone.Time(this.synth.get().envelope.release).toMilliseconds();
            
            this.releaseTimeoutId = setTimeout(() => {
                this.isBusy = false;
                this.activePointerId = null;
            }, releaseTimeMs + 100); // Add buffer
        }
    }

    attackRelease(freq: number, dur: Tone.Unit.Time, time: number, vel: number) {
        if (this.releaseTimeoutId) clearTimeout(this.releaseTimeoutId);
        this.isBusy = true;
        this.activePointerId = null; 

        this.synth.triggerAttackRelease(freq, dur, time, vel);
        
        const releaseTimeMs = new Tone.Time(this.synth.get().envelope.release).toMilliseconds();
        const totalDurationMs = new Tone.Time(dur).toMilliseconds() + releaseTimeMs;
        
        // Calculate the time in milliseconds from now until the note is scheduled to start
        const scheduledStartTimeOffset = (time - Tone.now()) * 1000;

        this.releaseTimeoutId = setTimeout(() => {
            this.isBusy = false;
        }, Math.max(0, scheduledStartTimeOffset) + totalDurationMs + 100);
    }
    
    dispose() {
        if (this.releaseTimeoutId) clearTimeout(this.releaseTimeoutId);
        this.synth.dispose();
    }
}


export class AudioEngine {
    public isInitialized = false;
    private orbManager!: OrbManager;
    public drumMachine!: DrumMachine;
    private latchEngine!: LatchEngine;

    public channels!: { [key: string]: Tone.Channel };
    public fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };
    
    private voicePools: Map<InstrumentPart, Voice[]> = new Map();
    private presets: { [key: string]: any } = {};

    private allowedFrequencies = { bass: [] as number[], melody: [] as number[] };
    private isBassLatchOn = false;
    
    private currentInstruments: Record<'melody' | 'bass' | 'autopilot', Instrument> = {
        melody: 'theremin',
        bass: 'synth',
        autopilot: 'synth'
    };
    
    private autopilotSynth: Tone.Synth | null = null;

    constructor() {
        // Orb manager is now initialized after engine is ready in page.tsx
    }

    public async initialize() {
        if (this.isInitialized) return;
        await Tone.start();
        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        Tone.Transport.start(); // START THE METRONOME AND NEVER STOP IT

        // Master FX & Channels
        this.fx = {
            reverb: new Tone.Reverb({ decay: 8, wet: 1 }).toDestination(),
            delay: new Tone.FeedbackDelay("8n", 0.5).toDestination(),
        };
        this.channels = {
            melody: new Tone.Channel(-6),
            manualBass: new Tone.Channel(-6),
            latch: new Tone.Channel(-15),
            drums: new Tone.Channel(-9),
            autopilot: new Tone.Channel(-10),
            effects: new Tone.Channel(-6),
            ebass: new Tone.Channel(-6),
        };
        for (const channel of Object.values(this.channels)) {
            channel.connect(this.fx.reverb).connect(this.fx.delay).toDestination();
        }

        this.createPresets();
        this.initializeVoicePools();
        
        this.latchEngine = new LatchEngine(this);
        
        this.drumMachine = new DrumMachine(this.channels.drums);
        await this.drumMachine.initialize();

        // A single, one-voice synth for the worker.
        this.autopilotSynth = new Tone.Synth(this.presets.synth.options).connect(this.channels.autopilot);
        
        this.isInitialized = true;
        console.log(`AudioEngine initialized.`);
    }

    public setOrbManager(orbManager: OrbManager) {
        this.orbManager = orbManager;
        this.latchEngine.setOrbManager(orbManager);
    }

    private initializeVoicePools() {
        const poolSizes: Record<InstrumentPart, number> = {
            melody: 3,
            bass: 3,
            latch: 3,
            autopilot_melody: 0, // No longer used, worker has its own synth
            autopilot_accompaniment: 0,
            autopilot_bass: 0,
            autopilot_effects: 0
        };

        const partToChannel: Record<InstrumentPart, Tone.Channel> = {
            melody: this.channels.melody,
            bass: this.channels.manualBass,
            latch: this.channels.latch,
            // Autopilot channels are not needed for pools anymore
            autopilot_melody: this.channels.autopilot, 
            autopilot_accompaniment: this.channels.autopilot,
            autopilot_bass: this.channels.autopilot,
            autopilot_effects: this.channels.effects
        };
        
        for (const part of Object.keys(poolSizes) as InstrumentPart[]) {
             if (poolSizes[part] === 0) continue;
            const size = poolSizes[part];
            const channel = partToChannel[part];
            const pool: Voice[] = [];
            const initialPreset = this.presets['synth'];
            for (let i = 0; i < size; i++) {
                pool.push(new Voice(initialPreset, channel, part));
            }
            this.voicePools.set(part, pool);
        }
        
        this.reconfigurePool('melody', this.currentInstruments.melody);
        this.reconfigurePool('bass', this.currentInstruments.bass);
        this.reconfigurePool('latch', this.currentInstruments.bass);
    }

    private reconfigurePool(part: InstrumentPart, instrumentName: Instrument | string) {
        const pool = this.voicePools.get(part);
        const channel = this.getChannelForPart(part, instrumentName);
        let presetKey = this.getPresetKey(part, instrumentName);
        const preset = this.presets[presetKey];
        
        if (pool && preset && channel) {
            pool.forEach(voice => {
                 if (voice.synth.name !== preset.type) {
                     voice.synth.dispose();
                     if (preset.type === 'FMSynth') voice.synth = new Tone.FMSynth(preset.options).connect(channel);
                     else if (preset.type === 'AMSynth') voice.synth = new Tone.AMSynth(preset.options).connect(channel);
                     else if (preset.type === 'NoiseSynth') voice.synth = new Tone.NoiseSynth(preset.options).connect(channel);
                     else voice.synth = new Tone.Synth(preset.options).connect(channel);
                 } else {
                    voice.synth.set(preset.options);
                 }
            });
        }
    }
    
    private getChannelForPart(part: InstrumentPart, instrumentName: string | Instrument): Tone.Channel {
        if ((part === 'bass' || part === 'latch') && instrumentName === 'ebass') {
            return this.channels.ebass;
        }
        const partToChannelMap: Record<InstrumentPart, Tone.Channel> = {
            melody: this.channels.melody, bass: this.channels.manualBass, latch: this.channels.latch,
            autopilot_melody: this.channels.autopilot, autopilot_accompaniment: this.channels.autopilot,
            autopilot_bass: this.channels.autopilot, autopilot_effects: this.channels.effects
        };
        return partToChannelMap[part];
    }
    
    private getPresetKey(part: InstrumentPart, instrumentName: string | Instrument): string {
         if (instrumentName === 'E-Bells') {
            return (part === 'melody' || part.startsWith('autopilot_')) ? 'E-Bells_melody' : 'E-Bells_bass';
        }
        if (part === 'autopilot_effects' || part === 'autopilot_bass') {
            return instrumentName;
        }
        return instrumentName;
    }

    private getVoiceFromPool(part: InstrumentPart, pointerId: number | null = null): Voice | null {
        const pool = this.voicePools.get(part);
        if (!pool) return null;

        if (pointerId !== null) {
            const existing = pool.find(v => v.activePointerId === pointerId);
            if (existing) return existing;
        }

        const availableVoice = pool.find(v => v.isAvailable());
        if (!availableVoice) {
            // console.warn(`No available voice in pool for part: ${part}`);
            return null;
        }
        return availableVoice;
    }
    
    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        if (!this.isInitialized) return;
        const quantizedFreq = this.getClosestFrequency(freq, type);
        
        if (type === 'bass' && this.isBassLatchOn) {
            this.latchEngine.handleInteraction(pos, vol, quantizedFreq);
            return;
        }
        
        const voice = this.getVoiceFromPool(type, pointerId);
        if (voice) {
            const time = Tone.now();
            voice.attack(quantizedFreq, vol*vol, time, pointerId);
            this.orbManager?.addOrb(pointerId, type, pos.x, pos.y);
        }
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        if (!this.isInitialized) return;
        const voice = this.getVoiceFromPool(type, pointerId);
        if (voice) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            if (voice.synth.frequency) voice.synth.frequency.value = quantizedFreq;
            if (voice.synth.volume) voice.synth.volume.value = Tone.gainToDb(vol * vol);
            this.orbManager?.updateOrb(pointerId, pos.x, pos.y);
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        if (!this.isInitialized || (this.isBassLatchOn && type === 'bass')) return;
        const voice = this.getVoiceFromPool(type, pointerId);
        if (voice) {
            voice.release();
            this.orbManager?.removeOrb(pointerId);
        }
    }

    public playWorkerNote(note: NoteEvent) {
        if (!this.isInitialized || !this.autopilotSynth) return;
        // The worker sends note with frequency. Let the main thread's Transport schedule it.
        const time = Tone.now() + 0.1; // Add small buffer
        this.autopilotSynth.triggerAttackRelease(note.freq, note.dur, time, note.vel);
    }
    
    public stopAllSounds() {
        this.voicePools.forEach(pool => pool.forEach(voice => voice.release(0.1)));
        this.autopilotSynth?.releaseAll();
        this.orbManager?.removeAllOrbs();
        this.latchEngine.stopAll();
        if (this.isInitialized) this.drumMachine.stop();
    }
    
    public stopAllAutopilotSounds() {
        this.autopilotSynth?.releaseAll();
        // This is important to clear any scheduled but not yet played notes.
        Tone.Transport.cancel();
    }

    public setTempo(bpm: number) { if(this.isInitialized) Tone.Transport.bpm.value = bpm; }

    public setVolumes(volumes: Record<string, number>) {
        if(!this.isInitialized) return;
        this.channels.melody.volume.value = volumes.melody;
        this.channels.manualBass.volume.value = volumes.manualBass;
        this.channels.latch.volume.value = volumes.latch;
        this.channels.drums.volume.value = volumes.drums;
        this.channels.autopilot.volume.value = volumes.autopilot;
        this.channels.effects.volume.value = volumes.effects;
        this.channels.ebass.volume.value = volumes.ebass;
    }

    public setEffects(effects: Record<string, any>) {
        if(!this.isInitialized) return;
        for (const key in this.channels) {
            if (effects[key]) {
                this.channels[key].send('reverb', effects[key].reverb);
                this.channels[key].send('delay', effects[key].delay);
            }
        }
    }
    
    public setBeatPattern(patternName: string) { if(this.isInitialized) this.drumMachine.setBeatPattern(patternName); }
    
    public setMelodyInstrument(instrument: Instrument) {
        if(!this.isInitialized) return;
        this.currentInstruments.melody = instrument;
        this.reconfigurePool('melody', instrument);
    }

    public setBassInstrument(instrument: Instrument) {
        if(!this.isInitialized) return;
        this.currentInstruments.bass = instrument;
        this.reconfigurePool('bass', instrument);
        this.reconfigurePool('latch', instrument);
    }

    public setAutopilotInstrument(instrument: Instrument) {
        if(!this.isInitialized || !this.autopilotSynth) return;
        this.currentInstruments.autopilot = instrument;
        const preset = this.presets[instrument];
        if (preset) {
            this.autopilotSynth.set(preset.options);
        }
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        if(!this.isInitialized) return;
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [3, 4, 5]),
        };
        this.latchEngine.setAllowedFrequencies(this.allowedFrequencies.bass);
    }

    public setBassLatch(isLatchOn: boolean) {
        if(!this.isInitialized) return;
        this.isBassLatchOn = isLatchOn;
        this.latchEngine.setLatch(isLatchOn);
    }
    
    public getLatchVoice(freq: number, vol: number): Voice | null {
        const voice = this.getVoiceFromPool('latch');
        if (voice) {
            voice.attack(freq, vol, Tone.now(), null);
        }
        return voice;
    }
    
    public releaseLatchVoice(voice: Voice) { voice.release(0.5); }

    public stop() {
        if (this.isInitialized) {
            this.stopAllSounds();
            // DO NOT STOP THE TRANSPORT
            // We only stop the parts that are playing.
            this.drumMachine.stop();
        }
    }
    
    private createPresets() {
        this.presets = {
            synth: { type: 'Synth', options: { oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 } } },
            organ: { type: 'Synth', options: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 1.2 } } },
            theremin: { type: 'Synth', options: { oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 } } },
            mellotron: { type: 'FMSynth', options: { harmonicity: 3, modulationIndex: 0.5, oscillator: { type: "sine" }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.4, release: 0.8 }, modulation: { type: "sine" }, modulationEnvelope: { attack: 0.2, decay: 0.5, sustain: 0.1, release: 0.8 } } },
            ebass: { type: 'FMSynth', options: { harmonicity: 1, modulationIndex: 3.5, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 } } },
            'E-Bells_melody': { type: 'FMSynth', options: { harmonicity: 1.4, modulationIndex: 20, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 } } },
            'E-Bells_bass': { type: 'FMSynth', options: { harmonicity: 1.4, modulationIndex: 15, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 2.5 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.01, decay: 1.0, sustain: 0, release: 1.0 } } },
            'G-Drops': { type: 'FMSynth', options: { harmonicity: 0.5, modulationIndex: 3.5, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.7, sustain: 0.1, release: 0.4 }, modulation: { type: 'triangle' }, modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.2 } } },
            autopilot_bass: { type: 'Synth', options: { oscillator: { type: "fmsine", harmonicity: 0.5 }, filter: { Q: 1, type: 'lowpass', rolloff: -12 }, envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 1.2 }, filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 1, baseFrequency: 200, octaves: 1.5 } } },
            autopilot_effect_star: { type: 'FMSynth', options: { harmonicity: 1.4, modulationIndex: 20, envelope: { attack: 0.01, decay: 1.2, release: 1.2 } } },
            autopilot_effect_meteor: { type: 'NoiseSynth', options: { noise: { type: 'white' }, filter: { Q: 10 }, envelope: { attack: 0.01, decay: 0.3, release: 0.5 } } },
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
                allFrequencies.push(Tone.Frequency(key + octave).transpose(interval).toFrequency());
            });
        });
        return allFrequencies.sort((a,b) => a - b);
    };

    private getClosestFrequency(targetFreq: number, type: 'bass' | 'melody'): number {
        const freqs = this.allowedFrequencies[type];
        if (freqs.length === 0) return targetFreq;
        return freqs.reduce((prev, curr) => (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev));
    }
}
