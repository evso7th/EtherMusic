

import * as Tone from 'tone';

export const beatPatterns = [
    { name: 'Air', type: 'Meditative' },
    { name: 'Earth', type: 'Meditative' },
    { name: 'Water', type: 'Meditative' },
    { name: 'Tibet', type: 'Meditative' },
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
    private drumSamplers: Record<string, Tone.Player> = {};
    private drumPart!: Tone.Part<{note: string | string[]}>;
    private conductorEventId: number | null = null;
    private measureCount = 0;
    private currentBeatPatternName = 'Off';
   
    constructor(outputChannel: Tone.Channel) {
        this.channel = outputChannel;
    }

    public async initialize() {
        if (this.isInitialized) return;
        await this.loadDrumSamples();
        this.setupDrumPart();
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

    public setBeatPattern(patternName: string) {
        if (!this.isInitialized) return;
        this.currentBeatPatternName = patternName;
        this.measureCount = 0;
        this.updateDrumAndConductor(patternName);
    }
    
    private async loadDrumSamples() {
        const drumUrls = {
            C1: "/assets/sounds/kick drum.wav", D1: "/assets/sounds/snare.wav", E1: "/assets/sounds/closed hi hat accented.wav",
            E2: "/assets/sounds/closed hi hat ghost.wav", F1: "/assets/sounds/crash.wav", G1: "/assets/sounds/high tom.wav",
            G2: "/assets/sounds/mid tom.wav", G3: "/assets/sounds/low tom.wav",
        };
        
        const loadingPromises = Object.entries(drumUrls).map(([note, url]) => {
            return new Promise<void>((resolve) => {
                const player = new Tone.Player(url).connect(this.channel);
                if (note === 'E1' || note === 'E2') player.volume.value = -3;
                this.drumSamplers[note] = player;
                Tone.loaded().then(() => resolve());
            });
        });
        await Promise.all(loadingPromises);
    }

    private setupDrumPart() {
        this.drumPart = new Tone.Part((time, value) => {
            const playNote = (note: string) => {
               if (this.drumSamplers[note]?.loaded) {
                   this.drumSamplers[note].start(time);
               }
           }
           if (Array.isArray(value.note)) {
               value.note.forEach(playNote);
           } else if (value.note) {
               playNote(value.note);
           }
       }, []).start(0);
       this.drumPart.loop = true;
       this.drumPart.loopEnd = '1m';
    }
    
    private updateDrumAndConductor(patternName: string) {
        if (!this.drumPart) return;

        this.drumPart.clear();
        
        if (patternName === 'Off') {
            if (this.conductorEventId !== null) {
                Tone.Transport.clear(this.conductorEventId);
                this.conductorEventId = null;
            }
            return;
        }
        
        this.startConductor();
        this.scheduleNextDrumMeasure();
    }

    private startConductor() {
        if (this.conductorEventId === null) {
            this.conductorEventId = Tone.Transport.scheduleRepeat((time) => {
                Tone.Draw.schedule(() => {
                    this.scheduleNextDrumMeasure();
                }, time);
            }, '1m');
        }
    }
    
    private scheduleNextDrumMeasure() {
        if (this.currentBeatPatternName === 'Off') {
            this.drumPart.clear();
            return;
        }

        const currentPatternData = beatPatternsData[this.currentBeatPatternName];
        if (!currentPatternData || !currentPatternData.groove?.length) {
            this.drumPart.clear();
            return;
        }
    
        const { groove, fills } = currentPatternData;
        const isFillMeasure = (this.measureCount % 4) === 3 && fills && fills.length > 0;
        
        const patternToPlay = isFillMeasure
            ? fills[Math.floor(Math.random() * fills.length)]
            : groove[Math.floor(Math.random() * groove.length)];

        this.drumPart.clear();
        patternToPlay.forEach((notes, i) => {
            if (notes) {
                const noteTime = `0:${Math.floor(i/4)}:${i%4}`;
                this.drumPart.add(noteTime, { note: notes });
            }
        });

        this.measureCount++;
    }
}


const beatPatternsData: { [key: string]: { groove: (string|string[])[][], fills: (string|string[])[][] } } = {
    Air: {
        groove: [
            [
                [], ['E2'], ['E1'], ['E2'], [], ['E1'], ['E2'], ['E1'],
                [], [], ['E2'], [], [], ['E1'], [], ['E2'],
            ],
        ],
        fills: [
            [
                [], ['F1'], [], [], [], ['F1'], [], [],
                ['E1'], [], ['E2'], [], ['E1'], [], ['E2'], []
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
                [], ['E2'], ['E1'], ['E2'], [], ['E2'], ['E1'], ['E2'],
                [], ['E2'], [], ['E2'], ['E1'], ['E2'], ['F1'], [],
            ]
        ],
        fills: [
            [
                ['F1'], ['E1'], [], ['E2'], ['F1'], [], ['F1'], ['E2'],
                [], ['E1'], ['F1'], [], ['F1'], ['E1'], [], ['F1'],
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

    
    