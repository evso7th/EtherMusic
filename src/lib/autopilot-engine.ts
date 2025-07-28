
import * as Tone from 'tone';
import { generateAutopilotPattern } from './music-engine';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';

type NoteEvent = {
    time: string;
    freq: number;
    dur: string;
    vel: number;
};

export class AutopilotEngine {
    public isInitialized = false;

    // --- Tone.js Objects ---
    private melodySynth!: Tone.Synth;
    private bassSynth!: Tone.Synth;
    private parts!: { bass: Tone.Part<NoteEvent>, melody: Tone.Part<NoteEvent> };
    private channel!: Tone.Channel;

    // --- Internal State ---
    private allowedFrequencies = { bass: [] as number[], melody: [] as number[] };
    private isAutopilotOn = false;
    private autopilotStyle: AutopilotStyle = 'Ambient';
    private musicKey: MusicKey = 'C';
    private musicScale: MusicScale = 'Major Pentatonic';

    public async initialize(fxReverb: Tone.Reverb, fxDelay: Tone.FeedbackDelay) {
        if (this.isInitialized) return;

        this.channel = new Tone.Channel(0).toDestination();
        this.channel.connect(fxReverb);
        this.channel.connect(fxDelay);
        
        this.bassSynth = new Tone.Synth({
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        }).connect(this.channel);

        this.melodySynth = new Tone.Synth({
            oscillator: { type: 'fatsine4', spread: 40, count: 4 },
            envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 },
        }).connect(this.channel);
        
        this.setupParts();

        this.isInitialized = true;
    }
    
    public setVolume(volume: number) {
        if (!this.isInitialized) return;
        this.channel.volume.value = volume;
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        if (!this.isInitialized) return;
        this.musicKey = key;
        this.musicScale = scale;
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [3, 4, 5]),
        };
        if (this.isAutopilotOn) {
            this.regeneratePatterns();
        }
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;
        this.isAutopilotOn = isOn;
        this.autopilotStyle = style;
        
        if (isOn) {
            this.regeneratePatterns();
            this.parts.bass.start(0);
            this.parts.melody.start(0);
            if (Tone.Transport.state !== 'started') Tone.Transport.start();
        } else {
            this.parts.bass.stop(0).clear();
            this.parts.melody.stop(0).clear();
            // No need to releaseAll for mono synths, stopping the part is enough
        }
    }

    private setupParts() {
        this.parts = {
            bass: new Tone.Part((time, note) => {
                this.bassSynth?.triggerAttackRelease(note.freq, note.dur, time, note.vel);
            }, []).start(0),
            melody: new Tone.Part((time, note) => {
                this.melodySynth?.triggerAttackRelease(note.freq, note.dur, time, note.vel);
            }, []).start(0)
        };
        this.parts.bass.loop = true;
        this.parts.bass.loopEnd = '4m';
        this.parts.melody.loop = true;
        this.parts.melody.loopEnd = '4m';
    }
    
    private regeneratePatterns() {
        if (!this.isInitialized) return;
        
        this.parts.bass.clear();
        this.parts.melody.clear();

        if (this.allowedFrequencies.bass.length === 0 || this.allowedFrequencies.melody.length === 0) return;

        const { bassPattern, melodyPattern } = generateAutopilotPattern(
            this.autopilotStyle,
            this.allowedFrequencies
        );

        bassPattern.forEach(note => this.parts.bass.add(note.time, note));
        melodyPattern.forEach(note => this.parts.melody.add(note.time, note));
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
}
