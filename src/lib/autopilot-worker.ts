
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';

// --- TYPE DEFINITIONS ---

type NoteEvent = {
    time: number; // in seconds, relative to the start of the pattern
    freq: number;
    dur: number; // in seconds
    vel: number;
};

// Simplified note type for pattern definitions
type PatternNote = [
    timeQuant: number, // In 16th notes (0-63 for 4 measures)
    noteIndex: number,   // Index in the frequency array. Negative for bass.
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

// --- WORKER COMMUNICATION INTERFACES ---

export type WorkerEvent =
    | { type: 'generate' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setStyle', style: AutopilotStyle };

export type WorkerResponse =
    | { type: 'patternGenerated', melodyEvents: NoteEvent[], bassEvents: NoteEvent[] };


// --- WORKER STATE ---

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let freqs = {
    bass: [] as number[],
    melody: [] as number[],
};

// --- CORE LOGIC ---

function getScaleFrequencies(key: MusicKey, scale: MusicScale, octaves: number[]): number[] {
    const scaleIntervals: { [key in MusicScale]: string[] } = {
        'Major': ['0', '2', '4', '5', '7', '9', '11'], 'Minor': ['0', '2', '3', '5', '7', '8', '10'],
        'Major Pentatonic': ['0', '2', '4', '7', '9'], 'Minor Pentatonic': ['0', '3', '5', '7', '10'],
    };
    
    let allFrequencies: number[] = [];
    const intervals = scaleIntervals[scale];
    
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][ (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(key) + parseInt(interval)) % 12 ];
            const freq = noteToFrequency(noteName + octave);
            allFrequencies.push(freq);
        });
    });
    return allFrequencies.sort((a,b) => a - b);
}

function noteToFrequency(note: string): number {
    const notes = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
    const octave = parseInt(note.slice(-1));
    const key = note.slice(0, -1);
    const index = notes.indexOf(key);
    const i = index - notes.indexOf('A');
    return 440 * Math.pow(2, (octave - 4) + i / 12);
}

function updateFrequencies() {
    freqs = {
        bass: getScaleFrequencies(currentKey, currentScale, [2, 3]),
        melody: getScaleFrequencies(currentKey, currentScale, [4, 5]),
    };
}

function generatePattern() {
    if (freqs.bass.length === 0 || freqs.melody.length === 0) {
        updateFrequencies();
    }
    
    const melodyEvents: NoteEvent[] = [];
    const bassEvents: NoteEvent[] = [];
    const patternData = autopilotPatternsData[currentStyle];
    if (!patternData) return { melodyEvents, bassEvents };

    const groove = patternData.groove[Math.floor(Math.random() * patternData.groove.length)];
    const fill = patternData.fills[Math.floor(Math.random() * patternData.fills.length)];
    const combinedPattern = [...groove, ...fill];

    const sixteenthNoteDuration = 60 / 120 / 4; // Assume 120bpm for calculation, Transport will handle actual tempo

    combinedPattern.forEach(noteData => {
        const [timeQuant, noteIndex, durationStr = '8n', velocity = 0.5] = noteData;
        const startTime = timeQuant * sixteenthNoteDuration;
        const durationSeconds = (durationStr.endsWith('n') 
            ? (sixteenthNoteDuration * 16 / parseInt(durationStr)) 
            : (sixteenthNoteDuration * 8 / parseInt(durationStr))) * (durationStr.endsWith('t') ? 2/3 : 1);
        
        const isBassNote = noteIndex < 0;
        const freqsList = isBassNote ? freqs.bass : freqs.melody;
        const finalIndex = isBassNote ? Math.abs(noteIndex) - 1 : noteIndex;

        if (finalIndex < freqsList.length) {
            const event: NoteEvent = {
                time: startTime,
                freq: freqsList[finalIndex],
                dur: durationSeconds,
                vel: velocity,
            };
            if (isBassNote) {
                bassEvents.push(event);
            } else {
                melodyEvents.push(event);
            }
        }
    });
    
    postMessage({ type: 'patternGenerated', melodyEvents, bassEvents });
}

// --- EVENT LISTENER ---

self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type } = event.data;
    switch (type) {
        case 'generate':
            generatePattern();
            break;
        case 'setHarmony':
            currentKey = event.data.key;
            currentScale = event.data.scale;
            updateFrequencies();
            break;
        case 'setStyle':
            currentStyle = event.data.style;
            break;
    }
};

const autopilotPatternsData: { [key in AutopilotStyle]: AutopilotPatternData } = {
    Ambient: {
        groove: [
            [[-1, 1, '2m'], [0, 8, '2m'], [16, 5, '2m', 0.8]],
        ],
        fills: [
            [[32, 10, '1m'], [48, 3, '1m']],
        ]
    },
    House: {
        groove: [
            [[-1, 1, '4n'], [-5, 1, '4n'], [-9, 1, '4n'], [-13, 1, '4n'],
             [0, 0, '8n'], [2, 2, '8n'], [4, 4, '8n'], [6, 2, '8n'],
             [8, 7, '8n'], [10, 9, '8n'], [12, 11, '8n'], [14, 9, '8n']],
        ],
        fills: [
            [[48, 7, '8n'], [50, 9, '8n'], [52, 11, '4n']],
        ],
    },
    Wind: {
        groove: [
            [[0, 10, '2n'], [4, 14, '2n'], [8, 12, '2n']],
        ],
        fills: [
            [[48, 15, '8n'], [52, 14, '8n'], [56, 12, '4n'], [60, 10, '4n']],
        ],
    },
    Sequence: {
        groove: [
            [[-1, 1, '1m'], [-17, 4, '1m'], [0, 0, '8n'], [2, 4, '8n'], [4, 7, '8n'], [6, 4, '8n'], [8, 0, '8n'], [10, 4, '8n'], [12, 7, '8n'], [14, 4, '8n']],
            [[-1, 1, '1m'], [-17, 5, '1m'], [0, 2, '8n'], [2, 5, '8n'], [4, 9, '8n'], [6, 5, '8n'], [8, 2, '8n'], [10, 5, '8n'], [12, 9, '8n'], [14, 5, '8n']],
        ],
        fills: [
            [[48, 12, '8n'], [50, 9, '8n'], [52, 7, '8n'], [54, 4, '8n'], [56, 12, '8n'], [58, 9, '8n'], [60, 7, '8n'], [62, 4, '8n']],
        ],
    },
    Chimes: {
        groove: [
            [[0, 12, '1n', 0.8], [8, 16, '1n', 0.7], [16, 14, '1n', 0.8]],
        ],
        fills: [
            [[32, 19, '1m', 0.8], [48, 17, '1m', 0.7]],
        ]
    },
    Drone: {
        groove: [
            [[-1, 1, '4m', 0.4]],
            [[-1, 4, '4m', 0.35]],
        ],
        fills: [
            [[32, 8, '2n', 0.2]]
        ]
    },
    Toccata: {
        groove: [
            [[-1, 1, '4n'], [-5, 1, '4n'], [-9, 5, '4n'], [-13, 5, '4n'],
             [0,0,'16n'], [1,4,'16n'], [2,7,'16n'], [3,11,'16n'], [4,12,'16n'], [5,11,'16n'], [6,7,'16n'], [7,4,'16n'],
             [8,0,'16n'], [9,4,'16n'], [10,7,'16n'], [11,11,'16n'], [12,12,'16n'], [13,11,'16n'], [14,7,'16n'], [15,4,'16n']
            ],
        ],
        fills: [
             [[48,12,'16n'], [49,9,'16n'], [50,7,'16n'], [51,5,'16n'], [52,12,'16n'], [53,9,'16n'], [54,7,'16n'], [55,5,'16n'],
              [56,12,'16n'], [57,9,'16n'], [58,7,'16n'], [59,5,'16n'], [60,12,'16n'], [61,9,'16n'], [62,7,'16n'], [63,5,'16n']],
        ],
    },
    Promenade: {
        groove: [
            [[-1, 1, '4n'], [-5, 4, '4n'], [-9, 1, '4n'], [-13, 4, '4n'],
             [0, 0, '4n'], [4, 2, '4n'], [8, 4, '4n'], [12, 0, '4n']],
        ],
        fills: [
            [[48, 7, '4n'], [52, 5, '4n'], [56, 4, '2n']],
        ]
    },
     Space: {
        groove: [
             [[-1, 1, '1m', 0.6], [0, 0, '8n'], [2, 4, '8n'], [4, 7, '8n'], [6, 4, '8n'],
              [16, 4, '1m', 0.6], [16, 2, '8n'], [18, 5, '8n'], [20, 9, '8n'], [22, 5, '8n']],
        ],
        fills: [
            [[48, 11, '2n', 0.8], [56, 16, '2n', 0.3]],
        ],
    },
};
