
import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle, MelodyInstrument } from '@/app/page';

type NoteEvent = {
    time: string;
    freq: number;
    dur: string;
    vel: number;
};

// Simplified note type for pattern definitions
type PatternNote = [
    timeQuant: number, // In 16th notes (0-63 for 4 measures)
    noteIndex: number,   // Index in the frequency array
    duration?: string,    // Optional duration, defaults to '8n'
    velocity?: number     // Optional velocity, defaults to 0.5
];

type AutopilotPatternData = {
    groove: PatternNote[][];
    fills: PatternNote[][];
};

export class AutopilotEngine {
    public isInitialized = false;

    // --- Tone.js Objects ---
    private melodySynths: Tone.Synth[] = [];
    private bassSynths: Tone.Synth[] = [];
    private parts!: { bass: Tone.Part<NoteEvent>, melody: Tone.Part<NoteEvent> };
    private channel!: Tone.Channel;
    private regenerationLoop!: Tone.Loop;

    // --- Internal State ---
    private isAutopilotOn = false;
    private autopilotStyle: AutopilotStyle = 'Ambient';
    private musicKey: MusicKey = 'C';
    private musicScale: MusicScale = 'Major Pentatonic';
    private freqs = {
        bass: [] as number[],
        melody: [] as number[],
    };

    public async initialize(fxReverb: Tone.Reverb, fxDelay: Tone.FeedbackDelay) {
        if (this.isInitialized) return;

        this.channel = new Tone.Channel(0).toDestination();
        this.channel.connect(fxReverb);
        this.channel.connect(fxDelay);
        
        this.createSynthPools();
        this.setupParts();

        // This loop regenerates the pattern every 4 measures
        this.regenerationLoop = new Tone.Loop(time => {
            Tone.Draw.schedule(() => {
                this.regeneratePatterns();
            }, time);
        }, '4m').start(0);

        this.isInitialized = true;
    }
    
    public setVolume(volume: number) {
        if (!this.isInitialized) return;
        this.channel.volume.value = volume;
    }

    public setEffects(effects: { reverb: number, delay: number }) {
        if (!this.isInitialized || !this.channel) return;
        this.channel.send('reverb', effects.reverb);
        this.channel.send('delay', effects.delay);
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        if (!this.isInitialized) return;
        this.musicKey = key;
        this.musicScale = scale;
        this.updateFrequencies();
        if (this.isAutopilotOn) {
            this.regeneratePatterns();
        }
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;
        const wasOn = this.isAutopilotOn;
        this.isAutopilotOn = isOn;
        this.autopilotStyle = style;
        
        if (isOn) {
            if (!wasOn) { // Just turned on
                this.updateFrequencies();
                this.regeneratePatterns();
            }
            this.regenerationLoop.start();
            this.parts.bass.start();
            this.parts.melody.start();
        } else {
            this.regenerationLoop.stop();
            this.parts.bass.stop().clear();
            this.parts.melody.stop().clear();
            this.melodySynths.forEach(s => s.triggerRelease());
            this.bassSynths.forEach(s => s.triggerRelease());
        }
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


     private createSynthPools() {
        const bassSynthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        };
        for (let i = 0; i < 2; i++) {
            this.bassSynths.push(new Tone.Synth(bassSynthOptions).connect(this.channel));
        }

        const melodySynthOptions = {
            oscillator: { type: 'fatsine4', spread: 40, count: 4 },
            envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 },
        };
        for (let i = 0; i < 4; i++) {
            this.melodySynths.push(new Tone.Synth(melodySynthOptions).connect(this.channel));
        }
    }

    private playNote(type: 'melody' | 'bass', note: NoteEvent, time: Tone.Unit.Time) {
        const synthPool = type === 'melody' ? this.melodySynths : this.bassSynths;
        // Simple round-robin is enough here
        const synth = synthPool[Math.floor(Math.random() * synthPool.length)];
        synth.triggerAttackRelease(note.freq, note.dur, time, note.vel);
    }

    private setupParts() {
        this.parts = {
            bass: new Tone.Part((time, note) => {
                this.playNote('bass', note, time);
            }, []),
            melody: new Tone.Part((time, note) => {
                this.playNote('melody', note, time);
            }, [])
        };
        this.parts.bass.loop = true;
        this.parts.bass.loopEnd = '4m';
        this.parts.melody.loop = true;
        this.parts.melody.loopEnd = '4m';
    }
    
    private regeneratePatterns() {
        if (!this.isInitialized || !this.isAutopilotOn || this.freqs.bass.length === 0 || this.freqs.melody.length === 0) return;
        
        this.parts.bass.clear();
        this.parts.melody.clear();
        
        const patternData = autopilotPatternsData[this.autopilotStyle];
        if (!patternData) return;
        
        // Choose a random groove and a random fill
        const groove = patternData.groove[Math.floor(Math.random() * patternData.groove.length)];
        const fill = patternData.fills[Math.floor(Math.random() * patternData.fills.length)];
        const combinedPattern = [...groove, ...fill];

        combinedPattern.forEach(noteData => {
            const [timeQuant, noteIndex, duration = '8n', velocity = 0.5] = noteData;
            
            const m = Math.floor(timeQuant / 16);
            const q = Math.floor((timeQuant % 16) / 4);
            const s = timeQuant % 4;
            const time = `${m}:${q}:${s}`;

            const isBassNote = noteIndex < 0;
            const freqs = isBassNote ? this.freqs.bass : this.freqs.melody;
            const finalIndex = isBassNote ? Math.abs(noteIndex) - 1 : noteIndex;
            
            if (finalIndex < freqs.length) {
                const event: NoteEvent = {
                    time,
                    freq: freqs[finalIndex],
                    dur: duration,
                    vel: velocity,
                };
                if (isBassNote) {
                    this.parts.bass.add(event);
                } else {
                    this.parts.melody.add(event);
                }
            }
        });
    }
    
    private updateFrequencies() {
        this.freqs = {
            bass: this.getScaleFrequencies(this.musicKey, this.musicScale, [2, 3]),
            melody: this.getScaleFrequencies(this.musicKey, this.musicScale, [3, 4, 5]),
        };
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


const autopilotPatternsData: { [key in AutopilotStyle]: AutopilotPatternData } = {
    Ambient: {
        groove: [
            [[-1, 1, '1m'], [0, 8, '2m'], [16, 5, '2m']],
        ],
        fills: [
            [[48, 10, '1m'], [56, 3, '1m']],
        ]
    },
    House: {
        groove: [
            [[-2, 1], [-8, 1], [-16, 2], [-24, 2], [0, 0, '16n'], [4, 2, '16n'], [8, 4, '16n'], [12, 2, '16n']],
        ],
        fills: [
            [[48, 7, '8n'], [52, 9, '8n'], [56, 11, '4n']],
        ]
    },
    Wind: {
        groove: [
            [[0, 10], [2, 12], [4, 14], [6, 12], [8, 10], [10, 12], [12, 14], [14, 12]],
        ],
        fills: [
            [[48, 15, '8n'], [52, 14, '8n'], [56, 12, '4n'], [60, 10, '4n']],
        ]
    },
    Sequence: {
        groove: [
            [[-1, 1], [-9, 1], [-17, 4], [-25, 4], [0, 0], [4, 4], [8, 7], [12, 4]],
            [[-1, 1], [-9, 5], [-17, 2], [-25, 2], [0, 2], [4, 5], [8, 9], [12, 5]],
        ],
        fills: [
            [[48, 12], [52, 9], [56, 7], [60, 4]],
        ]
    },
    Chimes: {
        groove: [
            [[0, 12, '2n', 0.8], [8, 16, '2n', 0.7], [16, 14, '2n', 0.8]],
        ],
        fills: [
            [[48, 19, '1n', 0.8], [56, 17, '1n', 0.7]],
        ]
    },
    Drone: {
        groove: [
            [[-1, 1, '4m', 0.4]],
            [[-1, 4, '4m', 0.35]],
        ],
        fills: [
            [[48, 8, '4n', 0.2]]
        ]
    },
    Toccata: {
        groove: [
            [[-1, 1], [-5, 1], [-9, 1], [-13, 1], [0,0,'16n'],[2,4,'16n'],[4,7,'16n'],[6,11,'16n'], [8,12,'16n'],[10,7,'16n'],[12,4,'16n'],[14,0,'16n']],
        ],
        fills: [
             [[48,12,'16n'], [50,11,'16n'], [52,9,'16n'], [54,7,'16n'], [56,5,'16n'], [58,4,'16n'], [60,2,'16n'], [62,0,'16n']],
        ]
    },
    Promenade: {
        groove: [
            [[-1, 1, '4n'], [-9, 4, '4n'], [-17, 1, '4n'], [-25, 4, '4n'], [0, 0, '4n'], [4, 2, '4n'], [8, 4, '4n'], [12, 0, '4n']],
        ],
        fills: [
            [[48, 7, '4n'], [52, 5, '4n'], [56, 4, '2n']],
        ]
    },
     Space: {
        groove: [
             [[-1, 1, '1m', 0.6], [0, 0, '1m', 0.4], [16, 4, '1m', 0.45], [32, 7, '1m', 0.5]],
        ],
        fills: [
            [[48, 11, '2n', 0.8], [56, 16, '2n', 0.3]], // "Meteor" sound effect
        ]
    },
};
