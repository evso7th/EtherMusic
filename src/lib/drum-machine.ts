
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
    { name: 'Space', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 5, note: 'h' }, { time: 11, note: 'y' }] }, // Approximation of 1/3
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
    private _pattern: BeatPattern = beatPatterns.find(p => p.name === 'Off')!;
    private intervalId: number | null = null;
    private step: number = 0;
    
    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
    }

    public get isPlaying(): boolean {
        return this.intervalId !== null;
    }

    public setTempo(bpm: number) {
        this._tempo = bpm;
        if (this.isPlaying) {
            this.stop();
            this.play();
        }
    }

    public setPattern(patternName: string) {
        const newPattern = beatPatterns.find(p => p.name === patternName);
        if (newPattern) {
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
            return;
        }
        this.step = 0;
        // A "beat" is a quarter note.
        const sixteenthNoteDurationMs = (60 / this._tempo / 4) * 1000; 
        
        this.intervalId = window.setInterval(() => {
            this.scheduler();
        }, sixteenthNoteDurationMs);
    }
    
    public pause() {
        this.stop();
    }

    public stop() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.step = 0;
        }
    }

    private scheduler() {
        const totalSteps = this._pattern.length * 16;
        const currentStep = this.step % totalSteps;

        this._pattern.sequence.forEach(note => {
            if (note.time === currentStep) {
                this.audioEngine.playDrumSample(note.note, note.vol);
            }
        });

        this.step++;
    }
}
