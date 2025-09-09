
import type { AudioEngine } from './audio-engine';

export type BeatPattern = {
    name: string;
    type: 'Meditative' | 'Classic' | 'System' | 'Fill';
    length: number; // in measures
    sequence: {
        time: number; // in 16th note steps (0-15 for a 1-bar loop in 4/4)
        note: string;
        vol?: number;
    }[];
};

export const beatPatterns: Readonly<BeatPattern[]> = [
    // Meditative
    { name: 'Air', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 8, note: 'h' }] },
    { name: 'Earth', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 8, note: 's' }] },
    { name: 'Water', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 't' }, { time: 4, note: 'H' }, { time: 8, note: 'T' }, { time: 12, note: 'H' }] },
    { name: 'Tibet', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'l' }, { time: 8, note: 'y' }] },
    { name: 'Space', type: 'Meditative', length: 2, sequence: [{ time: 0, note: 'k' }, { time: 10, note: 'h' }, { time: 22, note: 'y' }] },
    // Classic
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
    // System
    { name: 'Off', type: 'System', length: 1, sequence: [] },
    // Fills
    { name: 'Tom Fill 1', type: 'Fill', length: 1, sequence: [
        { time: 0, note: 't', vol: 0.6 }, { time: 2, note: 't', vol: 0.7 }, { time: 4, note: 'T', vol: 0.8 }, { time: 6, note: 'T', vol: 0.9 },
        { time: 8, note: 'l', vol: 1.0 }, { time: 10, note: 'l', vol: 0.9 }, { time: 12, note: 'l', vol: 0.8 }, { time: 14, note: 'l', vol: 0.7 },
    ]},
    { name: 'Tom Fill 2', type: 'Fill', length: 1, sequence: [
        { time: 0, note: 't', vol: 0.7 }, { time: 4, note: 'T', vol: 0.8 }, { time: 8, note: 'l', vol: 0.9 }, { time: 12, note: 'l', vol: 1.0 },
    ]},
    { name: 'Tom Fill 3', type: 'Fill', length: 1, sequence: [
        { time: 8, note: 't', vol: 0.6 }, { time: 10, note: 'T', vol: 0.7 }, { time: 12, note: 'l', vol: 0.8 }, { time: 14, note: 'l', vol: 0.9 },
    ]},
];

export class DrumMachine {
    private audioEngine: AudioEngine;
    private _tempo: number = 90;
    private _swing: number = 0;
    private _pattern: BeatPattern;
    private timeoutId: NodeJS.Timeout | null = null;
    private step: number = 0;
    private measureCount: number = 0;
    private isPlayingFill: boolean = false;
    private fillPatterns: BeatPattern[];

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this._pattern = beatPatterns.find(p => p.name === 'Off')!;
        this.fillPatterns = beatPatterns.filter(p => p.type === 'Fill');
    }

    public get isPlaying(): boolean {
        return this.timeoutId !== null;
    }

    public setTempo(bpm: number) {
        this._tempo = bpm;
        if (this.isPlaying) {
            this.stop();
            this.play();
        }
    }
    
    public setSwing(swing: number) {
        this._swing = Math.max(0, Math.min(0.75, swing));
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
             if (newPattern.name !== 'Off' && wasPlaying) {
                this.play();
            }
        } else {
             console.warn(`[DrumMachine] Pattern "${patternName}" not found.`);
        }
    }

    public play() {
        if (this.isPlaying || !this._pattern || this._pattern.name === 'Off') {
            return;
        }
        this.step = 0;
        this.measureCount = 0;
        this.isPlayingFill = false;
        this.scheduler();
    }
    
    public pause() {
        this.stop();
    }

    public stop() {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
            this.step = 0;
            this.measureCount = 0;
            this.isPlayingFill = false;
        }
    }

    private scheduler() {
        const sixteenthNoteDuration = 60 / this._tempo / 4;
        
        let currentPattern = this._pattern;
        // Every 4th measure, play a fill, but only if we are not already playing one
        if (this.measureCount > 0 && this.measureCount % 4 === 0 && !this.isPlayingFill) {
            this.isPlayingFill = true;
            if (this.fillPatterns.length > 0) {
                const fillIndex = Math.floor(Math.random() * this.fillPatterns.length);
                currentPattern = this.fillPatterns[fillIndex];
            }
        }
        
        const totalSteps = currentPattern.length * 16;
        const currentStepInPattern = this.step % totalSteps;
        
        currentPattern.sequence.forEach(note => {
            if (note.time === currentStepInPattern) {
                this.audioEngine.playDrumSample(note.note, note.vol);
            }
        });

        // Determine delay until next step, incorporating swing
        let delay;
        if (this.step % 2 !== 0) { // Off-beat (swing it)
            delay = sixteenthNoteDuration * (1 + this._swing);
        } else { // On-beat
            delay = sixteenthNoteDuration * (1 - this._swing);
        }
        
        this.step = (this.step + 1);

        if (this.step % 16 === 0) { // A measure has passed
            this.measureCount++;
             if (this.isPlayingFill) {
                this.isPlayingFill = false; // Fill is over, go back to main pattern next measure
            }
        }
        
        // Reset step to keep it from growing indefinitely
        if (this.step >= totalSteps) {
            if (!this.isPlayingFill) {
                this.step = 0;
            }
        }


        this.timeoutId = setTimeout(() => this.scheduler(), delay * 1000);
    }
}
