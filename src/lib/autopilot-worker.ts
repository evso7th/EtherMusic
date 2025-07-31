
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
    const root = noteToFrequency(key + '0'); // Get base frequency for the key
    const scaleIntervals: { [key in MusicScale]: number[] } = {
        'Major': [0, 2, 4, 5, 7, 9, 11],
        'Minor': [0, 2, 3, 5, 7, 8, 10],
        'Major Pentatonic': [0, 2, 4, 7, 9],
        'Minor Pentatonic': [0, 3, 5, 7, 10],
    };
    
    let allFrequencies: number[] = [];
    const intervals = scaleIntervals[scale];
    
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            const freq = root * Math.pow(2, octave + interval / 12);
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
        melody: getScaleFrequencies(currentKey, currentScale, [3, 4, 5, 6]),
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
        const duration = (durationStr.endsWith('n') ? sixteenthNoteDuration * 16 / parseInt(durationStr) : sixteenthNoteDuration * 8 / parseInt(durationStr)) * (durationStr.endsWith('t') ? 2/3 : 1);
        
        const isBassNote = noteIndex < 0;
        const freqsList = isBassNote ? freqs.bass : freqs.melody;
        const finalIndex = isBassNote ? Math.abs(noteIndex) - 1 : noteIndex;

        if (finalIndex < freqsList.length) {
            const event: NoteEvent = {
                time: startTime,
                freq: freqsList[finalIndex],
                dur: duration,
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
            [[-1, 1, '2m'], [1, 8, '2m'], [17, 5, '2m', 0.8]], // Syncopated start
        ],
        fills: [
            [[48, 10, '1m'], [58, 3, '1m']], // Syncopated start
        ]
    },
    House: {
        groove: [
            // Syncopated bass and melody
            [[-2, 1, '1m'], [3, 0, '8n'], [7, 4, '8n', 0.7], [10, 2, '8n'], [-18, 2, '1m']],
        ],
        fills: [
            [[48, 7, '8n'], [51, 9, '8n'], [54, 11, '4n']], // Syncopated fill
        ],
        arpeggio: { pattern: 'up', speed: '16n', octaves: 1 }
    },
    Wind: {
        groove: [
            [[1, 10, '2n'], [5, 14, '2n'], [9, 12, '2n']], // Syncopated
        ],
        fills: [
            [[49, 15, '8n'], [53, 14, '8n'], [57, 12, '4n'], [61, 10, '4n']], // Syncopated
        ],
        arpeggio: { pattern: 'upDown', speed: '8t', octaves: 2 }
    },
    Sequence: {
        groove: [
            [[-1, 1, '1m'], [-17, 4, '1m'], [1, 0], [7, 4], [17, 7], [23, 4]], // Syncopated
            [[-1, 1, '1m'], [-17, 5, '1m'], [2, 2], [6, 5], [18, 9], [22, 5]], // Syncopated
        ],
        fills: [
            [[49, 12], [53, 9], [57, 7], [61, 4]], // Syncopated
        ],
        arpeggio: { pattern: 'up', speed: '16n', octaves: 2 }
    },
    Chimes: {
        groove: [
            [[2, 12, '2n', 0.8], [9, 16, '2n', 0.7], [18, 14, '2n', 0.8]], // Syncopated
        ],
        fills: [
            [[49, 19, '1n', 0.8], [59, 17, '1n', 0.7]], // Syncopated
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
            // Bass on downbeats, melody syncopated
            [[-1, 1, '1m'], [-17, 5, '1m'], [3,0], [7,7], [19,12], [23,4]],
        ],
        fills: [
             [[49,12], [53,9], [58,7], [61,5]], // Syncopated
        ],
        arpeggio: { pattern: 'upDown', speed: '16n', octaves: 2 }
    },
    Promenade: {
        groove: [
            [[-1, 1, '4n'], [-9, 4, '4n'], [-17, 1, '4n'], [-25, 4, '4n'], [0, 0, '4n'], [4, 2, '4n'], [8, 4, '4n'], [12, 0, '4n']],
        ],
        fills: [
            [[48, 7, '4n'], [52, 5, '4n'], [58, 4, '2n']], // Syncopated
        ]
    },
     Space: {
        groove: [
             [[-1, 1, '1m', 0.6], [2, 0], [18, 4], [34, 7]], // Syncopated
        ],
        fills: [
            [[49, 11, '2n', 0.8], [58, 16, '2n', 0.3]], // "Meteor" sound effect with syncopation
        ],
        arpeggio: { pattern: 'up', speed: '8n', octaves: 2 }
    },
};
