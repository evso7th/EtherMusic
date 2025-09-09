
import type { AudioEngine } from './audio-engine';

export type BeatPattern = {
    name: string;
    type: 'Meditative' | 'Classic' | 'System';
    length: number; // in measures
    sequence: {
        time: number; // in measures (e.g., 0, 0.25, 0.5, 0.75 for 16th notes in a 4/4 measure)
        note: string;
        vol?: number;
    }[];
};

export const beatPatterns: Readonly<BeatPattern[]> = [
    { name: 'Air', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 0.5, note: 'h' }] },
    { name: 'Earth', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 0.5, note: 's' }] },
    { name: 'Water', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 't' }, { time: 0.25, note: 'H' }, { time: 0.5, note: 'T' }, { time: 0.75, note: 'H' }] },
    { name: 'Tibet', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'l' }, { time: 0.5, note: 'y' }] },
    { name: 'Space', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 0.33, note: 'h' }, { time: 0.66, note: 'y' }] },
    { name: 'Toccata', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 0.125, note: 'H' }, { time: 0.25, note: 'k' }, { time: 0.375, note: 'H' },
        { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'k' }, { time: 0.875, note: 'H' },
    ]},
    { name: 'Nocturne', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k', vol: 0.8 }, { time: 0.25, note: 'H' }, { time: 0.5, note: 's', vol: 0.6 }, { time: 0.625, note: 'H', vol: 0.5 }, { time: 0.75, note: 'H' },
    ]},
    { name: 'Scherzo', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 0.25, note: 't' }, { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'T' },
    ]},
    { name: 'Aria', type: 'Classic', length: 1, sequence: [{ time: 0, note: 'c', vol: 0.7 }, { time: 0.5, note: 'b', vol: 0.9 }] },
    { name: 'Off', type: 'System', length: 1, sequence: [] },
];

export class DrumMachine {
    private audioEngine: AudioEngine;
    private _tempo: number = 90;
    private _pattern: BeatPattern = beatPatterns.find(p => p.name === 'Off')!;
    private intervalId: number | null = null;
    private step: number = 0;
    
    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        console.log('[DrumMachine] Initialized');
    }

    public get isPlaying(): boolean {
        return this.intervalId !== null;
    }

    public setTempo(bpm: number) {
        this._tempo = bpm;
        console.log(`[DrumMachine] Tempo set to ${bpm}`);
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
            if (wasPlaying || newPattern.name !== 'Off') {
                this.play();
            }
        }
    }

    public play() {
        if (this.isPlaying || this._pattern.name === 'Off') {
            console.log(`[DrumMachine] Play command ignored. isPlaying: ${this.isPlaying}, pattern: ${this._pattern.name}`);
            return;
        }

        console.log('[DrumMachine] play() called.');
        this.step = 0;
        const intervalMs = (60 / this._tempo) * 1000 / 4; // Schedule 16th notes
        
        console.log(`[DrumMachine] Starting loop with interval ${intervalMs.toFixed(2)}ms for tempo ${this._tempo} BPM.`);
        
        this.intervalId = window.setInterval(() => {
            this.scheduler();
        }, intervalMs);
    }
    
    public pause() {
        this.stop();
    }

    public stop() {
        if (this.intervalId !== null) {
            console.log('[DrumMachine] stop() called, clearing interval.');
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.step = 0;
        }
    }

    private scheduler() {
        const time = this.audioEngine.getContext().currentTime;
        const sixteenthNoteInBar = this.step % (this._pattern.length * 16);
        const timeInMeasure = (sixteenthNoteInBar / 16) / this._pattern.length;

        console.log(`[DrumMachine] Scheduler tick. Step: ${this.step}, Time in Measure: ${timeInMeasure.toFixed(3)}`);

        this._pattern.sequence.forEach(note => {
            // Using a tolerance for float comparison
            if (Math.abs(note.time - timeInMeasure) < 0.01) {
                console.log(`[DrumMachine] scheduling note: ${note.note} at step ${this.step}`);
                this.audioEngine.playDrumSample(note.note, time, note.vol);
            }
        });

        this.step++;
    }
}
