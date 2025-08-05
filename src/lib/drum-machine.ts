
import * as Tone from 'tone';

export const beatPatterns = [
    { name: 'Air', type: 'Meditative' },
    { name: 'Earth', type: 'Meditative' },
    { name: 'Water', type: 'Meditative' },
    { name: 'Tibet', type: 'Meditative' },
    { name: 'Space', type: 'Meditative' },
    { name: 'Toccata', type: 'Classic' },
    { name: 'Promenade', type: 'Classic' },
    { name: 'Nocturne', type: 'Classic' },
    { name: 'Scherzo', type: 'Classic' },
    { name: 'Aria', type: 'Classic' },
    { name: 'Off', type: 'System' },
];

export class DrumMachine {
    private isInitialized = false;
    private channel: Tone.Channel;
    private drumSamplers: Tone.Players | null = null;
    private drumPart: Tone.Part<{note: string | string[]}> | null = null;
    private currentBeatPatternName = 'Off';
   
    constructor(outputChannel: Tone.Channel) {
        this.channel = outputChannel;
    }

    public async initialize() {
        if (this.isInitialized) return;
        await this.loadDrumSamples();
        
        // Initialize the part but don't start it immediately.
        this.drumPart = new Tone.Part((time, value) => {
             const playNote = (note: string, offset: number) => {
               if (this.drumSamplers?.has(note)) {
                    this.drumSamplers.player(note).start(time + offset);
               }
           }
           if (Array.isArray(value.note)) {
               value.note.forEach((note, index) => playNote(note, index * 0.001)); // Add a tiny offset
           } else if (value.note) {
               playNote(value.note, 0);
           }
        }, []);

        this.drumPart.loop = true;
        this.drumPart.loopEnd = '4m';

        this.isInitialized = true;
    }

    public setVolume(volume: number) {
        if (!this.isInitialized || !this.drumSamplers) return;
        this.drumSamplers.volume.value = volume;
    }

    public setEffects(effects: { reverb: number, delay: number }) {
        if (!this.isInitialized || !this.channel) return;
        this.channel.send('reverb', effects.reverb);
        this.channel.send('delay', effects.delay);
    }
    
    public start() {
        if (!this.isInitialized || !this.drumPart) return;
        this.drumPart.start(0);
    }

    public setBeatPattern(patternName: string) {
        if (!this.isInitialized || !this.drumPart) return;
        
        this.currentBeatPatternName = patternName;
        this.drumPart.clear();

        if (patternName === 'Off') {
            this.stop();
            return;
        }
        
        const patternData = beatPatternsData[patternName];
        if (!patternData || !patternData.groove?.length) {
            return;
        }

        // We'll schedule 4 measures
        for (let measure = 0; measure < 4; measure++) {
            const isFillMeasure = (measure % 4 === 3) && patternData.fills && patternData.fills.length > 0;
            const patternToPlay = isFillMeasure
                ? patternData.fills[Math.floor(Math.random() * patternData.fills.length)]
                : patternData.groove[Math.floor(Math.random() * patternData.groove.length)];

            patternToPlay.forEach((notes, i) => {
                if (notes && notes.length > 0) {
                    const time = `${measure}:${Math.floor(i / 4)}:${i % 4}`;
                    this.drumPart?.add(time, { note: notes });
                }
            });
        }
    }
    
    public stop() {
        if (!this.isInitialized || !this.drumPart) return;
        this.drumPart.stop();
        this.drumPart.clear();
        this.drumSamplers?.stopAll();
    }
    
    private async loadDrumSamples() {
        const drumUrls = {
            C1: "/assets/sounds/kick drum.wav", D1: "/assets/sounds/snare.wav", E1: "/assets/sounds/closed hi hat accented.wav",
            E2: "/assets/sounds/closed hi hat ghost.wav", F1: "/assets/sounds/crash.wav", G1: "/assets/sounds/high tom.wav",
            G2: "/assets/sounds/mid tom.wav", G3: "/assets/sounds/low tom.wav",
        };
        
        return new Promise<void>((resolve, reject) => {
             this.drumSamplers = new Tone.Players(drumUrls, () => {
                if (!this.drumSamplers) {
                    console.error("Drum samplers failed to create.");
                    reject(new Error("Drum samplers failed to create."));
                    return;
                }
                this.drumSamplers.player('E1').volume.value = -3;
                this.drumSamplers.player('E2').volume.value = -6;
                this.drumSamplers.player('F1').volume.value = -9;
                this.drumSamplers.connect(this.channel);
                resolve();
            }).toDestination();
        });
    }
}


const beatPatternsData: { [key: string]: { groove: (string|string[])[][], fills: (string|string[])[][] } } = {
    Air: {
        groove: [
            [
                [], [], ['E1'], [], [], [], [], [],
                [], [], [], [], [], ['E2'], [], [],
            ],
        ],
        fills: [
            [
                [], [], [], [], [], [], ['F1'], [],
                ['E1'], [], [], [], ['E1'], [], [], []
            ]
        ]
    },
    Earth: {
        groove: [
            [
                ['C1'], [], [], [], ['C1'], [], [], [],
                ['C1'], [], [], [], ['C1'], [], [], [],
            ],
        ],
        fills: [
            [
                [], ['G1'], [], ['G2'], [], ['G3'], [], ['C1'],
                [], ['E2'], [], ['G3'], [], ['G2'], [], ['F1'],
            ]
        ]
    },
    Water: {
        groove: [
            [
                [], ['E2'], [], [], [], [], ['E1'], [],
                [], [], [], ['E2'], [], [], ['F1'], [],
            ]
        ],
        fills: [
            [
                ['F1'], [], [], [], [], [], ['F1'], [],
                [], ['E1'], ['F1'], [], [], ['E1'], [], ['F1'],
            ]
        ]
    },
    Tibet: {
        groove: [
            [
                ['C1'], [], [], [], [], ['D1'], [], [],
                [], ['C1'], [], [], [], [], [], [],
            ]
        ],
        fills: [
            [
                ['D1'], [], [], [], [], ['C1'], [], [],
                [], [], ['C1'], [], [], [], ['D1'], [],
            ]
        ]
    },
    Space: {
        groove: [
            [
                ['C1'], [], [], [], [], [], [], [],
                [], [], [], [], ['E2'], [], [], [],
            ],
            [
                [], [], [], [], [], [], [], [],
                ['C1'], [], [], [], [], [], [], [],
            ]
        ],
        fills: [
            [
                [], [], [], ['F1'], [], [], [], [],
                [], [], [], [], [], [], [], [],
            ]
        ]
    },
    Toccata: {
        groove: [[
            ['C1', 'E1'], ['E2'], ['D1', 'E1'], ['E2'], ['C1', 'E1'], ['E2'], ['D1', 'E1'], ['E2'],
            ['C1', 'E1'], ['E2'], ['D1', 'E1'], ['E2'], ['C1', 'E1'], ['E2'], ['D1', 'E1'], ['E2']
        ]],
        fills: [
            [
                ['G1'], ['G1'], ['G2'], ['G2'], ['G3'], ['G3'], ['F1', 'C1'], ['F1'],
                ['G1'], ['G2'], ['G3'], [], ['F1'], ['D1'], ['F1', 'C1'], ['F1', 'D1'],
            ],
            [
                ['G1'], ['E2'], ['G1'], ['E2'], ['G2'], ['E2'], ['G2'], ['E2'],
                ['G3'], ['E2'], ['G3'], ['E1'], ['F1', 'D1'], ['C1'], ['F1', 'C1'], ['C1']
            ]
        ]
    },
    Promenade: {
        groove: [[
            ['C1', 'E2'], ['E2'], ['C1', 'E2'], ['E2'], ['C1', 'E2'], ['E2'], ['C1', 'E2'], ['E2'],
            ['C1', 'E2'], ['E2'], ['C1', 'E2'], ['E2'], ['C1', 'E2'], ['E2'], ['C1', 'E2'], ['E2'],
        ]],
        fills: [
            [
                ['C1'], ['E2'], ['C1', 'E2'], ['E2'], ['C1'], ['E2'], ['C1', 'E2'], ['E2'],
                ['D1'], ['E2'], ['D1', 'E2'], ['E2'], ['D1'], ['E2'], ['D1', 'E2', 'F1'], ['F1'],
            ]
        ]
    },
    Nocturne: {
        groove: [[
            ['C1'], ['E1', 'E2'], ['E2'], ['E1', 'E2'], ['C1'], ['E1', 'E2'], ['E2'], ['E1', 'E2'],
            ['C1'], ['E1', 'E2'], ['E2'], ['E1', 'E2'], ['C1'], ['E1', 'E2'], ['E2'], ['E1', 'E2'],
        ]],
        fills: [
            [
                ['E2'], ['E2'], ['E2'], ['E2'], ['E2'], ['E2'], ['E2'], ['E2'],
                ['E1'], ['E1'], ['E1'], ['E1'], ['E1'], ['E1'], ['E1'], ['E1'],
            ]
        ]
    },
    Scherzo: {
        groove: [[
            [], ['E1', 'E2'], ['C1','D1'], ['E2'], [], ['E1', 'E2'], ['C1','D1'], ['E2'],
            [], ['E1', 'E2'], ['C1','D1'], ['E2'], [], ['E1', 'E2'], ['C1','D1'], ['E2'],
        ]],
        fills: [
            [
                ['G1'], [], ['G2'], [], ['G3'], [], ['C1','D1'], [],
                ['G1'], ['G1'], ['G2'], ['G2'], ['G3'], ['G3'], ['C1', 'D1', 'F1'], [],
            ]
        ]
    },
    Aria: {
        groove: [[
            ['C1', 'E2'], ['E1'], ['D1', 'E2'], ['E1'], ['C1', 'E2'], ['E1'], ['D1', 'E2'], ['E1'],
            ['C1', 'E2'], ['E1'], ['D1', 'E2'], ['E1'], ['C1', 'E2'], ['E1'], ['D1', 'E2'], ['E1'],
        ]],
        fills: [
            [
                ['G1'], [], ['G1'], ['G2'], [], ['G2'], ['G3'], [],
                ['G3'], ['D1', 'G3'], ['D1'], ['D1'], ['F1', 'D1'], ['C1'], ['D1'], ['C1']
            ]
        ]
    },
    Off: {
        groove: [],
        fills: []
    }
};
