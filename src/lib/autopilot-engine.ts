
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

type ArpeggioPattern = 'up' | 'down' | 'upDown' | 'random';

type AutopilotPatternData = {
    groove: PatternNote[][];
    fills: PatternNote[][];
    arpeggio?: {
        pattern: ArpeggioPattern;
        speed: string; // e.g., '16n', '8t' (triplet)
        octaves: number;
    };
};

const ALL_KEYS: MusicKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ALL_SCALES: MusicScale[] = ['Major', 'Minor', 'Major Pentatonic', 'Minor Pentatonic'];

export class AutopilotEngine {
    public isInitialized = false;

    // --- Tone.js Objects ---
    private melodySynths: Tone.Synth[] = [];
    private bassSynths: Tone.Synth[] = [];
    private parts!: { bass: Tone.Part<NoteEvent>, melody: Tone.Part<NoteEvent> };
    private channel!: Tone.Channel;
    private regenerationLoop!: Tone.Loop;
    private modulationLoop!: Tone.Loop;

    // --- Internal State ---
    private isAutopilotOn = false;
    private autopilotStyle: AutopilotStyle = 'Ambient';
    private userKey: MusicKey = 'C';
    private userScale: MusicScale = 'Major Pentatonic';
    private currentKey: MusicKey = 'C';
    private currentScale: MusicScale = 'Major Pentatonic';

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

        // This loop handles modulation and transposition
        this.modulationLoop = new Tone.Loop(time => {
            Tone.Draw.schedule(() => {
                this.evolveHarmony();
            }, time);
        }, '8m').start(0);


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
        this.userKey = key;
        this.userScale = scale;
        // On manual change, reset autopilot harmony to user's choice
        this.currentKey = key;
        this.currentScale = scale;
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
                this.currentKey = this.userKey;
                this.currentScale = this.userScale;
                this.updateFrequencies();
                this.regeneratePatterns();
            }
            this.regenerationLoop.start();
            this.modulationLoop.start();
            this.parts.bass.start();
            this.parts.melody.start();
        } else {
            this.regenerationLoop.stop();
            this.modulationLoop.stop();
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

    private evolveHarmony() {
        if (!this.isAutopilotOn) return;

        const decision = Math.random();

        if (decision < 0.4) { // 40% chance to transpose
            const currentKeyIndex = ALL_KEYS.indexOf(this.currentKey);
            const nextKeyIndex = (currentKeyIndex + (Math.random() > 0.5 ? 1 : -1) + ALL_KEYS.length) % ALL_KEYS.length;
            this.currentKey = ALL_KEYS[nextKeyIndex];
        } else if (decision < 0.6) { // 20% chance to modulate scale
            const availableScales = ALL_SCALES.filter(s => s !== this.currentScale);
            this.currentScale = availableScales[Math.floor(Math.random() * availableScales.length)];
        }
        // 40% chance to do nothing, keeping it stable
        
        this.updateFrequencies();
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
        
        const groove = patternData.groove[Math.floor(Math.random() * patternData.groove.length)];
        const fill = patternData.fills[Math.floor(Math.random() * patternData.fills.length)];
        const combinedPattern = [...groove, ...fill];

        combinedPattern.forEach(noteData => {
            this.scheduleNoteOrArpeggio(noteData, patternData.arpeggio);
        });
    }

    private scheduleNoteOrArpeggio(noteData: PatternNote, arpeggioOptions?: AutopilotPatternData['arpeggio']) {
        const [timeQuant, noteIndex, duration = '8n', velocity = 0.5] = noteData;
            
        const m = Math.floor(timeQuant / 16);
        const q = Math.floor((timeQuant % 16) / 4);
        const s = timeQuant % 4;
        const startTime = Tone.Time(`${m}:${q}:${s}`);

        const isBassNote = noteIndex < 0;

        if (isBassNote || !arpeggioOptions) {
            // Schedule a single bass note or a melody note without arpeggio
            const freqs = isBassNote ? this.freqs.bass : this.freqs.melody;
            const finalIndex = isBassNote ? Math.abs(noteIndex) - 1 : noteIndex;

            if (finalIndex < freqs.length) {
                const event: NoteEvent = {
                    time: startTime.toNotation(),
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
        } else {
            // Schedule a melody arpeggio
            const arpNotes = this.getArpeggioNotes(noteIndex, arpeggioOptions.octaves);
            const arpPattern = this.getArpeggioPattern(arpNotes, arpeggioOptions.pattern);
            const arpSpeed = Tone.Time(arpeggioOptions.speed);
            const arpNoteDuration = arpSpeed.toSeconds() * 1.2; // slight overlap

            arpPattern.forEach((arpNoteIndex, i) => {
                if (arpNoteIndex < this.freqs.melody.length) {
                    const event: NoteEvent = {
                        time: startTime.add(arpSpeed.mult(i)).toNotation(),
                        freq: this.freqs.melody[arpNoteIndex],
                        dur: Tone.Time(arpNoteDuration).toNotation(),
                        vel: velocity * (0.85 + Math.random() * 0.3), // add slight velocity variation
                    };
                    this.parts.melody.add(event);
                }
            });
        }
    }
    
    private getArpeggioNotes(baseNoteIndex: number, octaves: number): number[] {
        // Gets a slice of the scale around the base note for arpeggiation
        const scale = this.freqs.melody;
        if (!scale.length) return [];
        
        // Find notes for the arpeggio, e.g., root, third, fifth from the base note's position in the scale
        const noteIndices = [
            baseNoteIndex,
            baseNoteIndex + 2,
            baseNoteIndex + 4,
        ];

        if (octaves > 1) {
            const notesPerOctave = this.userScale.includes('Pentatonic') ? 5 : 7;
            noteIndices.push(baseNoteIndex + notesPerOctave);
        }

        return noteIndices.filter(i => i < scale.length);
    }
    
    private getArpeggioPattern(noteIndices: number[], pattern: ArpeggioPattern): number[] {
        if (noteIndices.length === 0) return [];
        switch(pattern) {
            case 'up':
                return noteIndices;
            case 'down':
                return [...noteIndices].reverse();
            case 'upDown':
                return [...noteIndices, ...[...noteIndices].reverse().slice(1)];
            case 'random':
                return noteIndices.sort(() => 0.5 - Math.random());
            default:
                return noteIndices;
        }
    }
    
    private updateFrequencies() {
        this.freqs = {
            bass: this.getScaleFrequencies(this.currentKey, this.currentScale, [2, 3]),
            melody: this.getScaleFrequencies(this.currentKey, this.currentScale, [3, 4, 5, 6]), // Added 6th octave for arpeggios
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
            [[-1, 1, '2m'], [0, 8, '2m'], [16, 5, '2m']],
        ],
        fills: [
            [[48, 10, '1m'], [56, 3, '1m']],
        ]
    },
    House: {
        groove: [
            [[-2, 1, '1m'], [-18, 2, '1m'], [0, 0, '8n'], [8, 4, '8n'], [12, 2, '8n']],
        ],
        fills: [
            [[48, 7, '8n'], [52, 9, '8n'], [56, 11, '4n']],
        ],
        arpeggio: { pattern: 'up', speed: '16n', octaves: 1 }
    },
    Wind: {
        groove: [
            [[0, 10, '2n'], [4, 14, '2n'], [8, 12, '2n']],
        ],
        fills: [
            [[48, 15, '8n'], [52, 14, '8n'], [56, 12, '4n'], [60, 10, '4n']],
        ],
        arpeggio: { pattern: 'upDown', speed: '8t', octaves: 2 }
    },
    Sequence: {
        groove: [
            [[-1, 1, '1m'], [-17, 4, '1m'], [0, 0], [8, 4], [16, 7], [24, 4]],
            [[-1, 1, '1m'], [-17, 5, '1m'], [0, 2], [8, 5], [16, 9], [24, 5]],
        ],
        fills: [
            [[48, 12], [52, 9], [56, 7], [60, 4]],
        ],
        arpeggio: { pattern: 'up', speed: '16n', octaves: 2 }
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
            [[-1, 1, '1m'], [-17, 5, '1m'], [0,0], [8,7], [16,12], [24,4]],
        ],
        fills: [
             [[48,12], [52,9], [56,7], [60,5]],
        ],
        arpeggio: { pattern: 'upDown', speed: '16n', octaves: 2 }
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
             [[-1, 1, '1m', 0.6], [0, 0], [16, 4], [32, 7]],
        ],
        fills: [
            [[48, 11, '2n', 0.8], [56, 16, '2n', 0.3]], // "Meteor" sound effect
        ],
        arpeggio: { pattern: 'up', speed: '8n', octaves: 2 }
    },
};
