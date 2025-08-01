

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';

// --- TYPE DEFINITIONS ---

export type NoteEventFromWorker = {
    time: number; // in seconds, relative to the start of the pattern
    freq: number;
    dur: number; // in seconds
    vel: number;
    isBass: boolean;
};

// Simplified note type for pattern definitions
type PatternNote = [
    timeQuant: number, // In 16th notes (0-63 for 4 measures)
    noteIndex: number,   // Index in the frequency array. Negative for bass.
    durationStr?: string,    // Optional duration, defaults to '8n'
    velocity?: number     // Optional velocity, defaults to 0.5
];

type AutopilotPatternData = {
    groove: PatternNote[][];
    fills: PatternNote[][];
};

// --- WORKER COMMUNICATION INTERFACES ---

export type WorkerEvent =
    | { type: 'generate' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setTempo', bpm: number };

export type WorkerResponse =
    | { type: 'patternGenerated', melodyEvents: NoteEventFromWorker[], bassEvents: NoteEventFromWorker[] };


// --- WORKER STATE ---

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let currentBpm = 120;
let freqs = {
    bass: [] as number[],
    melody: [] as number[],
};

// --- CORE LOGIC ---

// Simple frequency calculation to avoid Tone.js dependency in worker
function getNoteFrequency(key: MusicKey, octave: number, interval: number): number {
    const A4 = 440;
    const keyMap: {[key in MusicKey]: number} = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}

function getScaleFrequencies(key: MusicKey, scale: MusicScale, octaves: number[]): number[] {
    const scaleIntervals: { [key in MusicScale]: number[] } = {
        'Major': [0, 2, 4, 5, 7, 9, 11], 'Minor': [0, 2, 3, 5, 7, 8, 10],
        'Major Pentatonic': [0, 2, 4, 7, 9], 'Minor Pentatonic': [0, 3, 5, 7, 10],
    };
    
    let allFrequencies: number[] = [];
    const intervals = scaleIntervals[scale];
    
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            allFrequencies.push(getNoteFrequency(key, octave, interval));
        });
    });
    return allFrequencies.sort((a,b) => a - b);
}

function updateFrequencies() {
    freqs = {
        bass: getScaleFrequencies(currentKey, currentScale, [2, 3]),
        melody: getScaleFrequencies(currentKey, currentScale, [4, 5]),
    };
}

function durationToSeconds(duration: string, bpm: number): number {
    const quarterNoteDuration = 60 / bpm;
    const match = duration.match(/^(\d+)([ntm])$/);
    if (!match) return quarterNoteDuration / 2; // Default to 8n

    const value = parseInt(match[1]);
    const unit = match[2];

    switch(unit) {
        case 'n': // a subdivision
            if (value === 1) return quarterNoteDuration * 4;
            if (value === 2) return quarterNoteDuration * 2;
            if (value === 4) return quarterNoteDuration;
            if (value === 8) return quarterNoteDuration / 2;
            if (value === 16) return quarterNoteDuration / 4;
            return quarterNoteDuration * (4 / value);
        case 't': // a triplet
            return (quarterNoteDuration * 4) / (value * 1.5);
        case 'm': // a measure
            return value * 4 * quarterNoteDuration;
        default:
            return quarterNoteDuration / 2;
    }
}


function generatePattern() {
    if (freqs.bass.length === 0 || freqs.melody.length === 0) {
        updateFrequencies();
    }
    
    const melodyEvents: NoteEventFromWorker[] = [];
    const bassEvents: NoteEventFromWorker[] = [];
    const patternData = autopilotPatternsData[currentStyle];
    if (!patternData) {
        console.error(`No pattern data for style: ${currentStyle}`);
        postMessage({ type: 'patternGenerated', melodyEvents, bassEvents });
        return;
    }
    
    const totalMeasures = 4;
    const measuresPerGroove = patternData.groove.length;
    const fillsPerStyle = patternData.fills.length;
    
    let combinedPattern: PatternNote[] = [];

    for (let measure = 0; measure < totalMeasures; measure++) {
        let patternToAdd: PatternNote[];
        if (measure === totalMeasures - 1 && fillsPerStyle > 0) {
             patternToAdd = patternData.fills[Math.floor(Math.random() * fillsPerStyle)];
        } else {
             patternToAdd = patternData.groove[Math.floor(Math.random() * measuresPerGroove)];
        }
        
        patternToAdd.forEach(note => {
            const [timeQuant, ...rest] = note;
            combinedPattern.push([(measure * 16) + timeQuant, ...rest]);
        });
    }

    const sixteenthNoteDuration = durationToSeconds('16n', currentBpm);

    combinedPattern.forEach(noteData => {
        const [timeQuant, noteIndex, durationStr = '8n', velocity = 0.5] = noteData;
        const startTime = timeQuant * sixteenthNoteDuration;
        const durationSeconds = durationToSeconds(durationStr, currentBpm);
        
        const isBassNote = noteIndex < 0;
        const freqsList = isBassNote ? freqs.bass : freqs.melody;
        const finalIndex = isBassNote ? Math.abs(noteIndex) - 101 : noteIndex;
        
        if (finalIndex >= 0 && finalIndex < freqsList.length) {
            const event: NoteEventFromWorker = {
                time: startTime,
                freq: freqsList[finalIndex],
                dur: durationSeconds,
                vel: velocity,
                isBass: isBassNote,
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
        case 'setTempo':
            currentBpm = event.data.bpm;
            break;
    }
};

const BASS_NOTE = (index: number) => -101 - index;

const autopilotPatternsData: { [key in AutopilotStyle]: AutopilotPatternData } = {
    Ambient: {
        groove: [
            [[0, 8, '2m', 0.5], [16, 5, '2m', 0.6], [32, BASS_NOTE(1), '2m', 0.4]],
            [[0, 5, '2m', 0.5], [16, 1, '2m', 0.6], [32, BASS_NOTE(4), '2m', 0.4]],
        ],
        fills: [
            [[48, 10, '1m', 0.7], [56, 3, '1m', 0.5]],
        ]
    },
    House: {
        groove: [ 
            [
             [0, 0, '8n'], [2, 4, '8n'], [4, 7, '8n'], [6, 4, '8n'],
             [8, 9, '8n'], [10, 11, '8n'], [12, 9, '8n'], [14, 7, '8n'],
             [0, BASS_NOTE(0), '4n'], [4, BASS_NOTE(4), '4n'], [8, BASS_NOTE(7), '4n'], [12, BASS_NOTE(0), '4n'],
            ],
        ],
        fills: [
            [[48, 7, '8n'], [50, 9, '8n'], [52, 11, '4n'], [56, 9, '8n']],
        ],
    },
    Wind: {
        groove: [
            [[0, 10, '2n', 0.6], [4, 14, '2n', 0.7], [8, 12, '2n', 0.5]],
        ],
        fills: [
            [[48, 15, '8n'], [52, 14, '8n'], [56, 12, '4n'], [60, 10, '4n']],
        ],
    },
    Sequence: { 
        groove: [
            [
             [0, BASS_NOTE(0), '1m'],
             [0, 0, '16n'], [1, 4, '16n'], [2, 7, '16n'], [3, 12, '16n'], [4, 7, '16n'], [5, 4, '16n'], [6, 0, '16n'], [7, 4, '16n'],
             [8, 0, '16n'], [9, 4, '16n'], [10, 7, '16n'], [11, 12, '16n'], [12, 7, '16n'], [13, 4, '16n'], [14, 0, '16n'], [15, 4, '16n'],
            ],
            [
             [0, BASS_NOTE(2), '1m'],
             [0, 2, '16n'], [1, 5, '16n'], [2, 9, '16n'], [3, 14, '16n'], [4, 9, '16n'], [5, 5, '16n'], [6, 2, '16n'], [7, 5, '16n'],
             [8, 2, '16n'], [9, 5, '16n'], [10, 9, '16n'], [11, 14, '16n'], [12, 9, '16n'], [13, 5, '16n'], [14, 2, '16n'], [15, 5, '16n'],
            ],
        ],
        fills: [
            [
                [48, 12, '16n'], [49, 9, '16n'], [50, 7, '16n'], [51, 4, '16n'], [52, 12, '16n'], [53, 9, '16n'], [54, 7, '16n'], [55, 4, '16n'],
                [56, 14, '16n'], [57, 11, '16n'], [58, 9, '16n'], [59, 5, '16n'], [60, 14, '16n'], [61, 11, '16n'], [62, 9, '16n'], [63, 5, '16n']
            ],
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
            [[0, BASS_NOTE(0), '4m', 0.4]],
            [[0, BASS_NOTE(4), '4m', 0.35]],
        ],
        fills: [
            [[32, 8, '2n', 0.2]]
        ]
    },
    Toccata: { 
        groove: [
            [
             [0, BASS_NOTE(0), '2n'], [8, BASS_NOTE(5), '2n'],
             [0,0,'16n'], [1,4,'16n'], [2,7,'16n'], [3,11,'16n'], [4,12,'16n'], [5,11,'16n'], [6,7,'16n'], [7,4,'16n'],
             [8,0,'16n'], [9,4,'16n'], [10,7,'16n'], [11,11,'16n'], [12,12,'16n'], [13,11,'16n'], [14,7,'16n'], [15,4,'16n']
            ],
        ],
        fills: [
             [
              [48,12,'16n'], [49,9,'16n'], [50,7,'16n'], [51,5,'16n'], [52,12,'16n'], [53,9,'16n'], [54,7,'16n'], [55,5,'16n'],
              [56,12,'16n'], [57,9,'16n'], [58,7,'16n'], [59,5,'16n'], [60,12,'16n'], [61,9,'16n'], [62,7,'16n'], [63,5,'16n']
             ],
        ],
    },
    Promenade: { 
        groove: [
            [
                [0, 0, '4n'], [4, 2, '4n'], [8, 4, '4n'], [12, 0, '4n'],
                [0, BASS_NOTE(0), '4n'], [4, BASS_NOTE(4), '4n'], [8, BASS_NOTE(7), '8n'], [10, BASS_NOTE(2), '4n'],
            ],
        ],
        fills: [
            [[48, 7, '4n'], [52, 5, '8n'], [56, 4, '2n']],
        ]
    },
     Space: {
        groove: [
             [
              [0, BASS_NOTE(0), '1m', 0.6], 
              [0, 0, '8n'], [2, 4, '8n'], [4, 7, '8n'], [6, 4, '8n'],
              [8, 0, '8n'], [10, 4, '8n'], [12, 7, '8n'], [14, 4, '8n'],
             ],
             [
              [0, BASS_NOTE(4), '1m', 0.6], 
              [0, 2, '8n'], [2, 5, '8n'], [4, 9, '8n'], [6, 5, '8n'],
              [8, 2, '8n'], [10, 5, '8n'], [12, 9, '8n'], [14, 5, '8n'],
            ],
        ],
        fills: [
            [[48, 11, '2n', 0.8], [56, 16, '2n', 0.3]],
        ],
    },
};
