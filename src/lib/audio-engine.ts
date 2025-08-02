

import * as Tone from 'tone';
import type { MelodyInstrument, MusicKey, MusicScale } from '@/app/page';
import { LatchEngine } from './latch-engine';
import { DrumMachine } from './drum-machine';
import { OrbManager } from './orb-manager';

type ActiveNote = {
    type: 'melody' | 'bass';
    synth: Tone.Synth;
    initialFreq: number;
    x: number;
    y: number;
};

export type AutopilotInstrument = 'melody' | 'bass' | 'accompaniment' | 'effect';


export class AudioEngine {
    public isInitialized = false;
    private isPlaying = false;
    private orbManager: OrbManager;

    // --- Engines ---
    private latchEngine!: LatchEngine;
    public drumMachine!: DrumMachine;

    // --- Tone.js Objects ---
    public channels!: { 
        melody: Tone.Channel, 
        manualBass: Tone.Channel,
        latch: Tone.Channel, 
        drums: Tone.Channel, 
        autopilotBass: Tone.Channel,
        accompaniment: Tone.Channel,
        effects: Tone.Channel,
    };
    public fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };

    // Synth pools for manual playing
    private melodySynths: Tone.Synth[] = [];
    private manualBassSynths: Tone.Synth[] = [];
    private latchSynths: Tone.Synth[] = [];
    
    // Synth pools for autopilot
    private autopilotMelodySynths: Tone.Synth[] = [];
    private autopilotAccompanimentSynths: Tone.Synth[] = [];
    private autopilotBassSynths: Tone.Synth[] = [];
    private autopilotEffectsSynths: Tone.Synth[] = [];
    private nextAutopilotSynthIndex = { melody: 0, accompaniment: 0, bass: 0, effect: 0 };
    
    private recorder!: Tone.Recorder;
    
    // --- Internal State ---
    private activeNotes = new Map<number, ActiveNote>();
    
    private allowedFrequencies = { bass: [] as number[], melody: [] as number[] };
    private isBassLatchOn = false;
    private musicKey: MusicKey = 'C';
    private musicScale: MusicScale = 'Major Pentatonic';


    constructor(orbManager: OrbManager) {
        this.orbManager = orbManager;
    }

    // --- PUBLIC API ---

    public async initialize() {
        if (this.isInitialized) return;

        try {
            await Tone.start();
        } catch (e) {
            console.error("Tone.start() failed:", e);
            return;
        }

        // Master FX
        this.fx = {
            reverb: new Tone.Reverb({ decay: 8, wet: 1 }).toDestination(),
            delay: new Tone.FeedbackDelay("8n", 0.5).toDestination(),
        };

        // Master Channels
        this.channels = {
            melody: new Tone.Channel(-6),
            manualBass: new Tone.Channel(-6),
            latch: new Tone.Channel(-6),
            drums: new Tone.Channel(-9),
            autopilotBass: new Tone.Channel(-12),
            accompaniment: new Tone.Channel(-12),
            effects: new Tone.Channel(-9),
        };
        
        // Connect channels to FX and destination
        for (const channel of Object.values(this.channels)) {
            channel.connect(this.fx.reverb);
            channel.connect(this.fx.delay);
            channel.toDestination();
        }
        
        // Synth Pools & Dedicated Synths
        this.createManualSynthPools();
        this.createAutopilotSynthPools();
        
        // --- Latch Engine ---
        this.latchEngine = new LatchEngine(this.latchSynths, this.orbManager, []);
        
        // --- Drum Machine ---
        this.drumMachine = new DrumMachine(this.channels.drums);
        await this.drumMachine.initialize();
        
        // Recorder
        this.recorder = new Tone.Recorder();
        Tone.getDestination().connect(this.recorder);

        this.isInitialized = true;
    }

    public start() {
        if (!this.isInitialized || Tone.Transport.state === 'started') return;
        this.isPlaying = true;
        Tone.Transport.start();
        this.latchEngine.startAll();
    }

    public pause() {
        if (!this.isInitialized) return;
        this.isPlaying = false;
        if (Tone.Transport.state === 'started') {
            Tone.Transport.pause();
        }
        this.latchEngine.pauseAll();
    }

    public stop() {
        if (!this.isInitialized) return;
        this.isPlaying = false;
        
        // This stops the clock and cancels all scheduled events immediately.
        Tone.Transport.stop();
        
        // Immediately stop all manually played notes.
        this.activeNotes.forEach(note => note.synth.triggerRelease());
        this.activeNotes.clear();
        this.orbManager.removeAllOrbs('melody');
        this.orbManager.removeAllOrbs('bass');
        
        // Stop all other sound sources immediately.
        this.latchEngine.stopAll();
        this.drumMachine.stop();
        this.stopAutopilotSynths();
        
        // CRITICAL: Cancel any events that might have been scheduled just before stopping
        Tone.Transport.cancel();
    }
    
    public toggleRecording(): boolean {
        if (!this.isInitialized) return false;
        
        if (this.recorder.state === 'stopped') {
            this.recorder.start();
            return true;
        } else {
            this.recorder.stop().then(async (recording) => {
                const url = URL.createObjectURL(recording);
                const anchor = document.createElement("a");
                anchor.download = "ethermusic_recording.webm";
                anchor.href = url;
                anchor.click();
            });
            return false;
        }
    }

    // --- Setters for UI State ---

    public setTempo(bpm: number) {
        if (!this.isInitialized) return;
        Tone.Transport.bpm.value = bpm;
    }

    public setVolumes(volumes: Record<string, number>) {
        if (!this.isInitialized || !this.channels) return;
        this.channels.melody.volume.value = volumes.melody;
        this.channels.manualBass.volume.value = volumes.manualBass;
        this.channels.latch.volume.value = volumes.latch;
        this.drumMachine.setVolume(volumes.drums);
        this.channels.autopilotBass.volume.value = volumes.autopilot;
        this.channels.accompaniment.volume.value = volumes.autopilot;
        this.channels.effects.volume.value = volumes.effects;
    }

    public setEffects(effects: Record<string, { reverb: number, delay: number }>) {
        if (!this.isInitialized || !this.channels) return;
        this.channels.melody.send('reverb', effects.melody.reverb);
        this.channels.melody.send('delay', effects.melody.delay);
        this.channels.manualBass.send('reverb', effects.manualBass.reverb);
        this.channels.manualBass.send('delay', effects.manualBass.delay);
        this.channels.latch.send('reverb', effects.latch.reverb);
        this.channels.latch.send('delay', effects.latch.delay);
        this.drumMachine.setEffects(effects.drums);
        
        this.channels.autopilotBass.send('reverb', effects.autopilot.reverb);
        this.channels.autopilotBass.send('delay', effects.autopilot.delay);
        this.channels.accompaniment.send('reverb', effects.autopilot.reverb);
        this.channels.accompaniment.send('delay', effects.autopilot.delay);
        this.channels.effects.send('reverb', effects.effects.reverb);
        this.channels.effects.send('delay', effects.effects.delay);
    }
    
    public setBeatPattern(patternName: string) {
        if (!this.isInitialized) return;
        this.drumMachine.setBeatPattern(patternName);
    }
    
    public setMelodyInstrument(instrument: MelodyInstrument) {
        if (!this.isInitialized) return;
        let newOptions;
        switch (instrument) {
            case 'organ':
                newOptions = {
                     oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                     envelope: { attack: 0.05, decay: 0.3, sustain: 0.9, release: 0.8 },
                };
                break;
            case 'theremin':
                newOptions = {
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 },
                };
                break;
            case 'glass':
                newOptions = {
                     oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 },
                     envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.2 },
                };
                break;
            case 'synth':
            default:
                 newOptions = {
                    oscillator: { type: 'fatsine4', spread: 40, count: 4 },
                    envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 },
                };
                break;
        }
        // Apply to both manual and autopilot melody synths
        this.melodySynths.forEach(synth => synth.set(newOptions));
        this.autopilotMelodySynths.forEach(synth => synth.set(newOptions));
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        if (!this.isInitialized) return;
        this.musicKey = key;
        this.musicScale = scale;
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [3, 4, 5]),
        };
        this.latchEngine.setAllowedFrequencies(this.allowedFrequencies.bass);
    }

    public setBassLatch(isLatchOn: boolean) {
        if (!this.isInitialized) return;
        this.isBassLatchOn = isLatchOn;
        this.latchEngine.setLatch(isLatchOn);
    }

    // --- Theremin Interaction ---

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const quantizedFreq = this.getClosestFrequency(freq, type);

        if (type === 'bass' && this.isBassLatchOn) {
            this.latchEngine.handleInteraction(pos, vol, quantizedFreq);
            return;
        }

        const synthPool = type === 'melody' ? this.melodySynths : this.manualBassSynths;
        const activeSynths = new Set(Array.from(this.activeNotes.values()).map(n => n.synth));
        const freeSynth = synthPool.find(s => !activeSynths.has(s));

        if (freeSynth) {
            const velocity = vol * vol;
            freeSynth.triggerAttack(quantizedFreq, undefined, velocity);
            this.activeNotes.set(pointerId, { type, synth: freeSynth, initialFreq: quantizedFreq, x: pos.x, y: pos.y });
            this.orbManager.addOrb(pointerId, type, pos.x, pos.y);
        }
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const activeNote = this.activeNotes.get(pointerId);
        
        if (activeNote) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            activeNote.synth.frequency.rampTo(quantizedFreq, 0.01);
            
            const velocity = vol * vol;
            activeNote.synth.volume.rampTo(Tone.gainToDb(velocity), 0.01);
    
            activeNote.x = pos.x;
            activeNote.y = pos.y;
            this.orbManager.updateOrb(pointerId, pos.x, pos.y);
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        if (this.isBassLatchOn && type === 'bass') {
            return;
        }

        const activeNote = this.activeNotes.get(pointerId);
        if (activeNote) {
            activeNote.synth.triggerRelease();
            this.activeNotes.delete(pointerId);
            this.orbManager.removeOrb(pointerId);
        }
    }
    
     public playAutopilotEvent(note: {type: AutopilotInstrument, freq: number | number[], dur: Tone.Unit.Time, vel: number}) {
        if (!this.isInitialized) return;

        const time = Tone.now(); // Play immediately

        let synthPool: Tone.Synth[] | undefined;
        let synthIndex: keyof typeof this.nextAutopilotSynthIndex | undefined;
        
        switch (note.type) {
            case 'melody':
                synthPool = this.autopilotMelodySynths;
                synthIndex = 'melody';
                break;
            case 'accompaniment':
                synthPool = this.autopilotAccompanimentSynths;
                synthIndex = 'accompaniment';
                break;
            case 'bass':
                synthPool = this.autopilotBassSynths;
                synthIndex = 'bass';
                break;
            case 'effect':
                synthPool = this.autopilotEffectsSynths;
                synthIndex = 'effect';
                break;
        }

        if (synthPool && synthIndex && synthPool.length > 0) {
            const synth = synthPool[this.nextAutopilotSynthIndex[synthIndex]];
            if (note.type === 'effect' && typeof note.freq === 'number') {
                // Special handling for effects with pitch sweep
                synth.frequency.setValueAtTime(note.freq * 4, time); // Start high
                synth.frequency.exponentialRampToValueAtTime(note.freq, time + Tone.Time(note.dur).toSeconds());
                synth.triggerAttackRelease(note.dur, time, note.vel);
            } else {
                synth.triggerAttackRelease(note.freq, note.dur, time, note.vel);
            }
            this.nextAutopilotSynthIndex[synthIndex] = (this.nextAutopilotSynthIndex[synthIndex] + 1) % synthPool.length;
        }
    }

    public stopAutopilotSynths() {
        if (!this.isInitialized) return;
        
        // This is a more robust way to stop all synths in pools
        const allAutopilotSynths = [
            ...this.autopilotMelodySynths,
            ...this.autopilotAccompanimentSynths,
            ...this.autopilotBassSynths,
            ...this.autopilotEffectsSynths,
        ];

        allAutopilotSynths.forEach(synth => {
            if (synth && !synth.disposed) {
                synth.triggerRelease();
                // We don't dispose them, just release. They get reconfigured/reused.
            }
        });
        
        // Reset indices
        this.nextAutopilotSynthIndex = { melody: 0, accompaniment: 0, bass: 0, effect: 0 };
    }

    // --- PRIVATE METHODS ---
    
    private createManualSynthPools() {
        const melodySynthOptions = { portamento: 0.02, };
        for (let i = 0; i < 4; i++) {
            this.melodySynths.push(new Tone.Synth(melodySynthOptions).connect(this.channels.melody));
        }
        
        const bassSynthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        } as const;
        for (let i = 0; i < 2; i++) {
            this.manualBassSynths.push(new Tone.Synth(bassSynthOptions).connect(this.channels.manualBass));
        }

        const latchSynthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 0.8 },
        } as const;
        for (let i = 0; i < 2; i++) {
            this.latchSynths.push(new Tone.Synth(latchSynthOptions).connect(this.channels.latch));
        }
    }
    
     private createAutopilotSynthPools() {
        // Clear existing pools
        this.autopilotMelodySynths.forEach(s => s.dispose());
        this.autopilotAccompanimentSynths.forEach(s => s.dispose());
        this.autopilotBassSynths.forEach(s => s.dispose());
        this.autopilotEffectsSynths.forEach(s => s.dispose());

        this.autopilotMelodySynths = [];
        this.autopilotAccompanimentSynths = [];
        this.autopilotBassSynths = [];
        this.autopilotEffectsSynths = [];

        // Melody Synths (4 voices for density)
        const melodyOptions = {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 },
        };
        for (let i = 0; i < 4; i++) {
            this.autopilotMelodySynths.push(new Tone.Synth(melodyOptions).connect(this.channels.melody));
        }
        
        // Accompaniment Synths (4 voices, simplified timbre)
        const accompanimentOptions = {
            oscillator: { type: 'fatsine' }, // Slightly more complex than triangle
            envelope: { attack: 0.2, decay: 0.9, sustain: 0.1, release: 1.0 },
            volume: -8,
        };
        for (let i = 0; i < 4; i++) {
            this.autopilotAccompanimentSynths.push(new Tone.Synth(accompanimentOptions).connect(this.channels.accompaniment));
        }

        // Bass Synths (2 voices) - Bass Guitar-like sound
        const bassOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            filter: { Q: 5, type: 'lowpass', rolloff: -24 },
            envelope: { attack: 0.01, decay: 1.4, sustain: 0.1, release: 2 },
            filterEnvelope: { attack: 0.01, decay: 0.7, sustain: 0, release: 0, baseFrequency: 200, octaves: 1.5 }
        };
        for (let i = 0; i < 2; i++) {
            this.autopilotBassSynths.push(new Tone.Synth(bassOptions).connect(this.channels.autopilotBass));
        }

        // Effects Synths (2 voices) - Falling stars
        const effectOptions = {
            oscillator: { type: 'fmsine', modulationType: 'sine', harmonicity: 0.8 },
            envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 0 },
        };
        for (let i = 0; i < 2; i++) {
            this.autopilotEffectsSynths.push(new Tone.Synth(effectOptions).connect(this.channels.effects));
        }
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
}
