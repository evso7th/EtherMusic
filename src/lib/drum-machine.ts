
import type { AudioEngine } from './audio-engine';

export type BeatPattern = {
    name: string;
    type: 'Meditative' | 'Classic' | 'System';
    length: number; // in measures
    sequence: {
        time: number; // in 16th note steps (0-15 for a 1-bar loop in 4/4)
        note: string;
        vol?: number;
    }[];
};

export const beatPatterns: Readonly<BeatPattern[]> = [
    { name: 'Air', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 8, note: 'h' }] },
    { name: 'Earth', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 8, note: 's' }] },
    { name: 'Water', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 't' }, { time: 4, note: 'H' }, { time: 8, note: 'T' }, { time: 12, note: 'H' }] },
    { name: 'Tibet', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'l' }, { time: 8, note: 'y' }] },
    { name: 'Space', type: 'Meditative', length: 2, sequence: [{ time: 0, note: 'k' }, { time: 10, note: 'h' }, { time: 22, note: 'y' }] },
    { name: 'Toccata', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 2, note: 'H' }, { time: 4, note: 'k' }, { time: 6, note: 'H' },
        { time: 8, note: 's' }, { time: 10, note: 'H' }, { time: 12, note: 'k' }, { time: 14, note: 'H' },
    ]},
    { name: 'Nocturne', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k', vol: 0.8 }, { time: 4, note: 'H' }, { time: 8, note: 's', vol: 0.6 }, { time: 10, note: 'H', vol: 0.5 }, { time: 12, note: 'H' },
    ]},
    { name: 'Scherzo', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 4, note: 't' }, { time: 8, note: 's' }, { time: 10, note: 'H' }, { time: 12, note: 'T' },
    ]},
    { name: 'Aria', type: 'Classic', length: 1, sequence: [{ time: 0, note: 'c', vol: 0.7 }, { time: 8, note: 'b', vol: 0.9 }] },
    { name: 'Off', type: 'System', length: 1, sequence: [] },
];

export class DrumMachine {
    private audioEngine: AudioEngine;
    private _tempo: number = 90;
    private _pattern: BeatPattern;
    private intervalId: number | null = null;
    private step: number = 0;
    
    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this._pattern = beatPatterns.find(p => p.name === 'Off')!;
        console.log("[DrumMachine] Initialized");
    }

    public get isPlaying(): boolean {
        return this.intervalId !== null;
    }

    public setTempo(bpm: number) {
        console.log(`[DrumMachine] setTempo called with: ${bpm}`);
        this._tempo = bpm;
        if (this.isPlaying) {
            this.stop();
            this.play();
        }
    }

    public setPattern(patternName: string) {
        const newPattern = beatPatterns.find(p => p.name === patternName);
        if (newPattern) {
            console.log(`[DrumMachine] Pattern set to "${patternName}"`);
            const wasPlaying = this.isPlaying;
            if (wasPlaying) {
                this.stop();
            }
            this._pattern = newPattern;
             if (newPattern.name !== 'Off' && wasPlaying) {
                this.play();
            }
        } else {
             console.warn(`[DrumMachine] Pattern "${patternName}" not found.`);
        }
    }

    public play() {
        console.log(`[DrumMachine] play() called. Pattern: "${this._pattern?.name}", sequence length: ${this._pattern?.sequence?.length}`);
        if (this.isPlaying || !this._pattern || this._pattern.sequence.length === 0) {
            console.log(`[DrumMachine] Play command ignored. isPlaying: ${this.isPlaying}, pattern: ${this._pattern?.name}`);
            return;
        }
        
        this.step = 0; 
        const sixteenthNoteDurationMs = (60 / this._tempo / 4) * 1000; 
        console.log(`[DrumMachine] Starting loop with interval ${sixteenthNoteDurationMs.toFixed(2)}ms for tempo ${this._tempo} BPM.`);
        
        if (typeof window !== 'undefined') {
            this.scheduler(); 
            this.intervalId = window.setInterval(() => {
                this.scheduler();
            }, sixteenthNoteDurationMs);
        } else {
            console.error("[DrumMachine] Cannot start: 'window' is not defined. This should only run in a browser.");
        }
    }
    
    public pause() {
        this.stop();
    }

    public stop() {
        console.log("[DrumMachine] stop() called.");
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.step = 0;
            console.log("[DrumMachine] Loop stopped.");
        }
    }

    private scheduler() {
        if (!this.audioEngine || !this._pattern) return;
        
        const totalSteps = this._pattern.length * 16;
        
        console.log(`[DrumMachine] Scheduler tick. Step: ${this.step}`);

        this._pattern.sequence.forEach(note => {
            if (note.time === this.step) {
                console.log(`[DrumMachine] scheduling note: ${note.note} at step ${this.step}`);
                this.audioEngine.playDrumSample(note.note, note.vol);
            }
        });

        this.step = (this.step + 1) % totalSteps;
    }
}
