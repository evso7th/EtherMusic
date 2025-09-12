
import type { AudioEngine } from './audio-engine';
import type { BeatPattern } from '@/types';


export const beatPatterns: Readonly<BeatPattern[]> = [
    // Meditative
    { name: 'Air', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 8, note: 'h' }, { time: 12, note: 'p1', vol: 0.4 }] },
    { name: 'Earth', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 8, note: 's' }, { time: 4, note: 'p2', vol: 0.5 }] },
    { name: 'Water', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 't' }, { time: 4, note: 'H' }, { time: 8, note: 'T' }, { time: 12, note: 'p3', vol: 0.6 }] },
    { name: 'Tibet', type: 'Meditative', length: 2, sequence: [{ time: 0, note: 'Y' }, {time: 8, note: 'p4', vol: 0.5}, { time: 16, note: 'Z' }, {time: 24, note: 'p5', vol: 0.5}] },
    { name: 'Space', type: 'Meditative', length: 2, sequence: [{ time: 0, note: 'k' }, { time: 10, note: 'h' }, { time: 22, note: 'c' }, {time: 16, note: 'p6', vol: 0.4}] },

    // Classic
    { name: 'Toccata', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 2, note: 'H' }, { time: 3, note: 'p7', vol: 0.4 }, { time: 4, note: 'k' }, { time: 6, note: 'H' },
        { time: 8, note: 's' }, { time: 10, note: 'H' }, { time: 11, note: 'p8', vol: 0.4 }, { time: 12, note: 'k' }, { time: 14, note: 'H' },
    ]},
    { name: 'Nocturne', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k', vol: 0.8 }, { time: 4, note: 'H' }, { time: 7, note: 'p9', vol: 0.5 }, { time: 8, note: 's', vol: 0.6 }, { time: 10, note: 'H', vol: 0.5 }, { time: 12, note: 'H' },
    ]},
    { name: 'Scherzo', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 4, note: 't' }, { time: 8, note: 's' }, { time: 10, note: 'H' }, { time: 12, note: 'T' }, { time: 14, note: 'p10', vol: 0.7 },
    ]},
    { name: 'Aria', type: 'Classic', length: 1, sequence: [{ time: 0, note: 'c', vol: 0.7 }, { time: 8, note: 'b', vol: 0.9 }, {time: 14, note: 'p11', vol: 0.6}] },
    { name: 'Funky', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 4, note: 'h' }, { time: 6, note: 'H' }, { time: 8, note: 's' }, { time: 10, note: 'p12', vol: 0.5 }, { time: 12, note: 'k' }, { time: 14, note: 'H'},
    ]},
     { name: 'Airy', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 4, note: 'h' }, {time: 6, note: 'o'}, { time: 8, note: 's', vol: 0.6 }, { time: 12, note: 'h' }, { time: 14, note: 'p13', vol: 0.5}
    ]},
    { name: 'Groove', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'K' }, { time: 4, note: 'h' }, { time: 8, note: 'S' }, { time: 12, note: 'h' }, {time: 14, note: 'p14', vol: 0.7}
    ]},

    // Fills
    { name: 'Fill A', type: 'Fill', length: 1, sequence: [
        { time: 8, note: 't', vol: 0.6 }, { time: 10, note: 't', vol: 0.8 }, { time: 12, note: 'T', vol: 0.9 }, { time: 14, note: 'l', vol: 1.0 },
    ]},
     { name: 'Fill B', type: 'Fill', length: 1, sequence: [
        { time: 8, note: 'H', vol: 0.5 }, { time: 10, note: 't', vol: 0.7 }, { time: 12, note: 'T', vol: 0.8 }, { time: 13, note: 'p15', vol: 0.9 }, { time: 14, note: 'l', vol: 1.0 },
    ]},

    // System
    { name: 'Off', type: 'System', length: 1, sequence: [] },
];

export class DrumMachine {
    private audioEngine: AudioEngine;
    private _tempo: number = 90;
    private _swing: number = 0; // 0 = no swing, 1 = max swing
    private _pattern: BeatPattern;
    private timeoutId: number | null = null;
    private step: number = 0;
    private measureCount: number = 0;
    private fills: Readonly<BeatPattern[]>;
    public onPlayStateChange: (isPlaying: boolean) => void;
    
    constructor(audioEngine: AudioEngine, onPlayStateChange: (isPlaying: boolean) => void) {
        this.audioEngine = audioEngine;
        this.onPlayStateChange = onPlayStateChange;
        this._pattern = beatPatterns.find(p => p.name === 'Off')!;
        this.fills = beatPatterns.filter(p => p.type === 'Fill' && p.sequence.length > 0);
    }

    public get isPlaying(): boolean {
        return this.timeoutId !== null;
    }

    public setTempo(bpm: number) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.stop();
        this._tempo = bpm;
        if (wasPlaying) this.play();
    }
    
    public setSwing(swing: number) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.stop();
        this._swing = Math.max(0, Math.min(0.75, swing)); // Clamp swing between 0 and 0.75
         if (wasPlaying) this.play();
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
             } else if (newPattern.name === 'Off') {
                this.stop();
             }
        }
    }

    public play() {
        if (this.isPlaying || !this._pattern || this._pattern.sequence.length === 0) {
            if (this._pattern?.name === 'Off') {
                this.stop();
            }
            return;
        }
        
        this.step = 0; 
        this.measureCount = 0;
        this.onPlayStateChange(true);
        this.scheduler();
    }
    
    public stop() {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
            this.step = 0;
            this.measureCount = 0;
            this.onPlayStateChange(false);
        }
    }

    private scheduler() {
        const isFillMeasure = this.fills.length > 0 && this._pattern.type === 'Classic' && (this.measureCount === 3 || this.measureCount === 7);
        const currentPattern = isFillMeasure 
            ? this.fills[Math.floor(Math.random() * this.fills.length)] 
            : this._pattern;

        const totalSteps = currentPattern.length * 16;
        const sixteenthNoteDuration = 60 / this._tempo / 4;

        currentPattern.sequence.forEach(note => {
            if (note.time === this.step) {
                this.audioEngine.playDrumSample(note.note, note.vol);
            }
        });

        // Determine delay until next step, incorporating swing
        let delay;
        const isSwungBeat = this.step % 2 !== 0;
        
        if (isSwungBeat) {
            delay = sixteenthNoteDuration * (1 + this._swing);
        } else {
            delay = sixteenthNoteDuration * (1 - this._swing);
        }
        
        this.step = (this.step + 1);
        if (this.step >= totalSteps) {
            this.step = 0;
            this.measureCount = (this.measureCount + 1) % 8; // Cycle through 8 measures for less repetitive fills
        }

        this.timeoutId = window.setTimeout(() => this.scheduler(), delay * 1000);
    }
}
