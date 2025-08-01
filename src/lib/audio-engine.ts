

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


export class AudioEngine {
    public isInitialized = false;
    private isPlaying = false;
    private orbManager: OrbManager;

    // --- Engines ---
    private latchEngine!: LatchEngine;
    public drumMachine!: DrumMachine;

    // --- Tone.js Objects ---
    public channels!: { melody: Tone.Channel, bass: Tone.Channel, latch: Tone.Channel, drums: Tone.Channel };
    public fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };
    private melodySynths: Tone.Synth[] = [];
    private bassSynths: Tone.Synth[] = [];
    private latchSynths: Tone.Synth[] = [];
    
    private recorder!: Tone.Recorder;
    
    private bassGain!: Tone.Gain;
    
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
            melody: new Tone.Channel(-6).toDestination(),
            bass: new Tone.Channel(-9).toDestination(),
            latch: new Tone.Channel(-9).toDestination(),
            drums: new Tone.Channel(-9).toDestination(),
        };
        
        // Connect channels to FX
        this.connectChannelsToFX();
        
        // Synth Pools
        this.createSynthPools();
        
        // --- Latch Engine ---
        // Initialize with empty frequencies, will be updated by setHarmony
        this.latchEngine = new LatchEngine(this.latchSynths, this.orbManager, []);
        
        // --- Drum Machine ---
        this.drumMachine = new DrumMachine(this.channels.drums);
        await this.drumMachine.initialize();

        // --- Bass Chain ---
        this.bassGain = new Tone.Gain(1).connect(this.channels.bass);
        
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
        Tone.Transport.stop();
        
        this.activeNotes.forEach(note => note.synth.triggerRelease());
        this.activeNotes.clear();
        this.orbManager.removeAllOrbs('melody');
        this.orbManager.removeAllOrbs('bass');
        
        this.latchEngine.stopAll();
        this.drumMachine.stop();
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
        this.channels.bass.volume.value = volumes.bass;
        this.channels.latch.volume.value = volumes.latch;
        this.drumMachine.setVolume(volumes.drums);
        // Autopilot volume is handled by the AutopilotEngine itself on its own channel
    }

    public setEffects(effects: Record<string, { reverb: number, delay: number }>) {
        if (!this.isInitialized || !this.channels) return;
        this.channels.melody.send('reverb', effects.melody.reverb);
        this.channels.melody.send('delay', effects.melody.delay);
        this.channels.bass.send('reverb', effects.bass.reverb);
        this.channels.bass.send('delay', effects.bass.delay);
        this.channels.latch.send('reverb', effects.latch.reverb);
        this.channels.latch.send('delay', effects.latch.delay);
        this.drumMachine.setEffects(effects.drums);
        // Autopilot effects are handled by the AutopilotEngine on its own channel
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
        this.melodySynths.forEach(synth => synth.set(newOptions));
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        if (!this.isInitialized) return;
        this.musicKey = key;
        this.musicScale = scale;
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [4, 5]),
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

        const synthPool = type === 'melody' ? this.melodySynths : this.bassSynths;
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
    
    public playAutopilotNote(time: number, note: {type: 'melody' | 'bass', freq: number, dur: number, vel: number}) {
        const synthPool = note.type === 'melody' ? this.melodySynths : this.bassSynths;
        
        // This is a simplified voice allocation. It finds a synth that is not currently playing.
        // It doesn't account for notes that *will be* playing at `time`.
        // For this application, this simplification is likely acceptable.
        const availableSynth = synthPool.find(s => s.state === 'stopped');

        if (availableSynth) {
             availableSynth.triggerAttackRelease(note.freq, note.dur, time, note.vel);
        }
    }


    // --- PRIVATE METHODS ---

    private connectChannelsToFX() {
        for (const channel of Object.values(this.channels)) {
            channel.connect(this.fx.reverb);
            channel.connect(this.fx.delay);
        }
    }
    
    private createSynthPools() {
        const bassSynthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        } as const;
        
        for (let i = 0; i < 2; i++) {
            const synth = new Tone.Synth(bassSynthOptions).connect(this.channels.bass);
            this.bassSynths.push(synth);
        }

        const melodySynthOptions = { 
            portamento: 0.02,
        };
        for (let i = 0; i < 4; i++) {
            this.melodySynths.push(new Tone.Synth(melodySynthOptions).connect(this.channels.melody));
        }

        const latchSynthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 0.8 },
        } as const;
        for (let i = 0; i < 2; i++) {
            this.latchSynths.push(new Tone.Synth(latchSynthOptions).connect(this.channels.latch));
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
