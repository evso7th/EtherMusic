
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
    private _swing: number = 0; // 0 = no swing, 1 = max swing
    private _pattern: BeatPattern;
    private timeoutId: NodeJS.Timeout | null = null;
    private step: number = 0;
    
    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this._pattern = beatPatterns.find(p => p.name === 'Off')!;
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
        this._swing = Math.max(0, Math.min(0.75, swing)); // Clamp swing between 0 and 0.75
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
        if (this.isPlaying || !this._pattern || this._pattern.sequence.length === 0) {
            return;
        }
        
        this.step = 0; 
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
        }
    }

    private scheduler() {
        const totalSteps = this._pattern.length * 16;
        const sixteenthNoteDuration = 60 / this._tempo / 4;

        this._pattern.sequence.forEach(note => {
            if (note.time === this.step) {
                this.audioEngine.playDrumSample(note.note, note.vol);
            }
        });

        // Determine delay until next step, incorporating swing
        let delay;
        if (this.step % 2 !== 0) {
            // Off-beat (swing)
            delay = sixteenthNoteDuration * (1 + this._swing);
        } else {
            // On-beat (no swing)
            delay = sixteenthNoteDuration * (1 - this._swing);
        }
        
        this.step = (this.step + 1) % totalSteps;

        this.timeoutId = setTimeout(() => this.scheduler(), delay * 1000);
    }
}
