
import type { AudioEngine } from './audio-engine';
import type { BeatPattern } from '@/types';

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
    private _tempo: number = 120;
    private _pattern: BeatPattern = beatPatterns.find(p => p.name === 'Off')!;
    private intervalId: number | null = null;
    private step: number = 0;
    private nextNoteTime: number = 0.0;
    private readonly lookahead: number = 25.0; // ms
    private readonly scheduleAheadTime: number = 0.1; // seconds

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
    }

    public get isPlaying(): boolean {
        return this.intervalId !== null;
    }

    public setTempo(bpm: number) {
        this._tempo = bpm;
    }

    public setPattern(patternName: string) {
        const newPattern = beatPatterns.find(p => p.name === patternName);
        if (newPattern) {
            this._pattern = newPattern;
            this.step = 0; // Reset step on pattern change
        }
    }

    public play() {
        if (this.isPlaying || this._pattern.name === 'Off') return;

        this.step = 0;
        this.nextNoteTime = this.audioEngine.getContext().currentTime;
        this.intervalId = window.setInterval(() => this.scheduler(), this.lookahead);
    }
    
    public pause() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public stop() {
        this.pause();
        this.step = 0;
    }

    private scheduler() {
        const audioCtxTime = this.audioEngine.getContext().currentTime;
        while (this.nextNoteTime < audioCtxTime + this.scheduleAheadTime) {
            this.scheduleNote(this.step, this.nextNoteTime);
            this.nextNote();
        }
    }

    private nextNote() {
        const secondsPerBeat = 60.0 / this._tempo;
        const totalSteps = this._pattern.sequence.reduce((max, note) => Math.max(max, note.time), 0) * 4 + 1;
        const stepsPerMeasure = this._pattern.length * 4; // Assuming 4 beats per measure
        
        this.step++;
        if (this.step >= (this._pattern.length * 16)) { // 16th notes
            this.step = 0;
        }
        
        const sixteenthNoteDuration = secondsPerBeat / 4;
        this.nextNoteTime += sixteenthNoteDuration;
    }

    private scheduleNote(beatNumber: number, time: number) {
        if (this._pattern.sequence.length === 0) return;

        const sixteenthNoteInBar = beatNumber % (this._pattern.length * 16);
        const timeInBar = sixteenthNoteInBar / 16.0;

        this._pattern.sequence.forEach(note => {
            // Use a small tolerance for floating point comparison
            if (Math.abs(note.time - timeInBar) < 0.001) {
                 this.audioEngine.playDrumSample(note.note, time, note.vol);
            }
        });
    }
}
