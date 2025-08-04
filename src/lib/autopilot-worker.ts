

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentPart } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type { AutopilotPart };

export type NoteEvent = {
    type: InstrumentPart;
    freq: number;
    dur: Unit.Time;
    vel: number;
};

export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale, bassOctaves: number[], melodyOctaves: number[], accompanimentOctaves: number[] }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setTempo', bpm: number }
    | { type: 'setParts', parts: Record<AutopilotPart, boolean> };


export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent };


// --- MUSICAL PATTERN DEFINITIONS ---

type PatternNote = {
    degree: number;      // Scale degree (e.g., 0 for root, 1 for next note in scale)
    dur: Unit.Time;    // Duration (e.g., '4n', '8n')
    vel: number;       // Velocity (0-1)
};

// A pattern is an array of notes for each tick of a 16-tick measure.
type Pattern = (PatternNote | null)[];

interface StylePatterns {
    bass: {
        grooves: Pattern[];
    };
    accompaniment: {
        grooves: Pattern[];
        fills: Pattern[];
    };
    melody: {
        grooves: Pattern[];
        fills: Pattern[];
    };
    effects: {
        probability: number; // Chance to play an effect per measure
    }
}

// --- WORKER STATE ---
let tickCount = 0;
const SUBDIVISIONS = 16; 
let timerId: number | null = null;
let intervalTime = 125; // Default for 120 bpm at 16th notes

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let enabledParts: Record<AutopilotPart, boolean> = { bass: true, accompaniment: true, melody: true, effects: true };

let scaleFrequencies: Record<'bass' | 'accompaniment' | 'melody', number[]> = {
    bass: [], accompaniment: [], melody: [],
};
let scaleIntervals: number[] = [];

// This state holds the currently selected patterns for the measure
let activePatterns: {
    bass: Pattern | null,
    accompaniment: Pattern | null,
    melody: Pattern | null,
} = {
    bass: null,
    accompaniment: null,
    melody: null,
}

// --- MUSIC THEORY & UTILITIES ---

const scaleIntervalMap: { [key in MusicScale]: number[] } = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};

function getNoteFrequency(key: MusicKey, octave: number, interval: number): number {
    const A4 = 440;
    const keyMap: {[key in MusicKey]: number} = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}

function getScaleFrequenciesForOctaves(key: MusicKey, scale: MusicScale, octaves: number[]): number[] {
    const intervals = scaleIntervalMap[scale];
    if (!intervals) return [];
    let allFrequencies: number[] = [];
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            allFrequencies.push(getNoteFrequency(key, octave, interval));
        });
    });
    return allFrequencies.sort((a,b) => a - b);
}

function getFrequencyFromDegree(degree: number, part: keyof typeof scaleFrequencies): number | null {
    const freqs = scaleFrequencies[part];
    const scaleLength = scaleIntervals.length;
    if (!freqs || freqs.length === 0 || !scaleLength) return null;
    
    const noteIndexInScale = degree >= 0 ? degree % scaleLength : (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }
    return null;
}

// --- PATTERN LIBRARY ---

const patternLibrary: Record<AutopilotStyle, StylePatterns> = {
    // Each style defines its own library of patterns
    Ambient: {
        bass: {
            grooves: [
                [{ degree: 0, dur: '1m', vel: 0.7 }, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
            ]
        },
        accompaniment: {
            grooves: [
                [{ degree: 0, dur: '2n', vel: 0.4 }, null, null, null, null, null, null, null, { degree: 4, dur: '2n', vel: 0.4 }, null, null, null, null, null, null, null]
            ],
            fills: [
                [{ degree: 2, dur: '1n', vel: 0.5 }, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
            ]
        },
        melody: {
            grooves: [
                [null, null, null, { degree: 7, dur: '2n', vel: 0.6 }, null, null, null, null, null, null, { degree: 9, dur: '2n', vel: 0.6 }, null, null, null, null, null],
            ],
            fills: [
                 [null, null, { degree: 11, dur: '1n', vel: 0.65 }, null, null, null, null, null, null, null, null, null, null, null, null, null],
            ]
        },
        effects: { probability: 0.1 }
    },
    Trance: {
        bass: {
            grooves: [
                [{ degree: 0, dur: '4n', vel: 0.9 }, null, null, null, { degree: 0, dur: '4n', vel: 0.9 }, null, null, null, { degree: 0, dur: '4n', vel: 0.9 }, null, null, null, { degree: 0, dur: '4n', vel: 0.9 }, null, null, null],
            ]
        },
        accompaniment: {
            grooves: [
                 [null, null, { degree: 4, dur: '8n', vel: 0.5 }, null, null, null, { degree: 5, dur: '8n', vel: 0.5 }, null, null, null, { degree: 4, dur: '8n', vel: 0.5 }, null, null, null, { degree: 7, dur: '8n', vel: 0.5 }, null],
            ],
            fills: [
                [null, null, { degree: 7, dur: '4n', vel: 0.6 }, null, null, null, { degree: 9, dur: '4n', vel: 0.6 }, null, null, null, { degree: 11, dur: '4n', vel: 0.6 }, null, { degree: 12, dur: '4n', vel: 0.6 }, null, null, null]
            ]
        },
        melody: {
            grooves: [
                [null, null, null, null, null, { degree: 7, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 7, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 11, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }]
            ],
            fills: [
                [{ degree: 12, dur: '4n', vel: 0.8 }, null, null, null, { degree: 11, dur: '4n', vel: 0.8 }, null, null, null, { degree: 9, dur: '4n', vel: 0.8 }, null, null, null, { degree: 7, dur: '4n', vel: 0.8 }, null, null, null],
            ]
        },
        effects: { probability: 0.05 }
    },
    // Add other styles here...
    Sequence: {
        bass: { grooves: [[{ degree: 0, dur: '2n', vel: 0.8 }, null, null, null, null, null, null, null, { degree: 0, dur: '2n', vel: 0.8 }, null, null, null, null, null, null, null]] },
        accompaniment: { 
            grooves: [[{ degree: 0, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 5, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 0, dur: '16n', vel: 0.5 }, null, { degree: 0, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 5, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 0, dur: '16n', vel: 0.5 }, null ]],
            fills: [[{ degree: 7, dur: '8n', vel: 0.6 }, null, { degree: 9, dur: '8n', vel: 0.6 }, null, { degree: 11, dur: '8n', vel: 0.6 }, null, { degree: 9, dur: '8n', vel: 0.6 }, null, { degree: 7, dur: '8n', vel: 0.6 }, null, { degree: 5, dur: '8n', vel: 0.6 }, null, { degree: 4, dur: '8n', vel: 0.6 }, null, { degree: 2, dur: '8n', vel: 0.6 }, null,]]
        },
        melody: {
            grooves: [[null, null, null, null, { degree: 7, dur: '4n', vel: 0.7 }, null, null, null, null, null, null, null, { degree: 9, dur: '4n', vel: 0.7 }, null, null, null]],
            fills: [[{ degree: 12, dur: '2n', vel: 0.75 }, null, null, null, null, null, null, null, { degree: 11, dur: '2n', vel: 0.75 }, null, null, null, null, null, null, null]]
        },
        effects: { probability: 0.15 }
    },
    Chimes: {
        bass: { grooves: [[{ degree: 0, dur: '1n', vel: 0.7}, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]] },
        accompaniment: {
            grooves: [[null, { degree: 4, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5}, null, { degree: 11, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5}, null, { degree: 4, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5}, null, { degree: 11, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5} ]],
            fills: [[{ degree: 2, dur: '4n', vel: 0.6 }, null, null, null, { degree: 5, dur: '4n', vel: 0.6 }, null, null, null, { degree: 7, dur: '4n', vel: 0.6 }, null, null, null, { degree: 10, dur: '4n', vel: 0.6 }, null, null, null]]
        },
        melody: {
            grooves: [[null, null, null, null, null, null, null, { degree: 12, dur: '2n', vel: 0.7 }, null, null, null, null, null, null, null, null ]],
            fills: [[{ degree: 14, dur: '1n', vel: 0.8}, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null ]]
        },
        effects: { probability: 0.25 }
    },
     Drone: {
        bass: { grooves: [[{ degree: 0, dur: '1m', vel: 0.6 }, null, null, null, null, null, null, null, { degree: -5, dur: '1m', vel: 0.6 }, null, null, null, null, null, null, null]] },
        accompaniment: { grooves: [[null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]], fills: [[]] },
        melody: { grooves: [[],[]], fills: [[]] },
        effects: { probability: 0.4 }
    },
    Toccata: {
        bass: { grooves: [[{ degree: 0, dur: '2n', vel: 0.9 }, null, null, null, null, null, null, null, { degree: -2, dur: '2n', vel: 0.85 }, null, null, null, null, null, null, null]] },
        accompaniment: {
            grooves: [
                [ { degree: 0, dur: '16n', vel: 0.6 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.6 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 5, dur: '16n', vel: 0.6 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 7, dur: '16n', vel: 0.6 }, { degree: 5, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.6 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 0, dur: '16n', vel: 0.6 }, null, null, null, null, null ]
            ],
            fills: [
                [ { degree: 7, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 11, dur: '8n', vel: 0.7 }, null, { degree: 12, dur: '8n', vel: 0.7 }, null, { degree: 11, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 7, dur: '8n', vel: 0.7 }, null, null, null ],
            ]
        },
        melody: {
            grooves: [
                [ null, null, null, null, null, null, null, null, { degree: 12, dur: '2n.', vel: 0.8 }, null, null, null, null, null, null, null ]
            ],
            fills: [
                [ { degree: 12, dur: '16n', vel: 0.8 }, { degree: 11, dur: '16n', vel: 0.8 }, { degree: 12, dur: '16n', vel: 0.8 }, { degree: 9, dur: '16n', vel: 0.8 }, { degree: 7, dur: '16n', vel: 0.8 }, null, null, null, { degree: 5, dur: '2n', vel: 0.8 }, null, null, null, null, null, null, null ]
            ]
        },
        effects: { probability: 0.1 }
    },
    Promenade: {
        bass: {
            grooves: [
                [{ degree: 0, dur: '4n', vel: 0.8 }, null, null, null, { degree: 0, dur: '4n', vel: 0.8 }, null, null, null, { degree: -3, dur: '4n', vel: 0.75 }, null, null, null, { degree: -3, dur: '4n', vel: 0.75 }, null, null, null]
            ]
        },
        accompaniment: {
            grooves: [
                [null, null, { degree: 4, dur: '4n', vel: 0.6 }, null, null, null, { degree: 5, dur: '4n', vel: 0.6 }, null, null, null, { degree: 0, dur: '4n', vel: 0.6 }, null, null, null, { degree: 2, dur: '4n', vel: 0.6 }, null]
            ],
            fills: [
                [{ degree: 7, dur: '2n', vel: 0.65 }, null, null, null, null, null, null, null, { degree: 5, dur: '2n', vel: 0.65 }, null, null, null, null, null, null, null]
            ]
        },
        melody: {
            grooves: [
                 [null, null, null, null, { degree: 9, dur: '1n', vel: 0.7 }, null, null, null, null, null, null, null, null, null, null, null]
            ],
            fills: [
                [{ degree: 12, dur: '2n', vel: 0.7 }, null, null, null, null, null, null, null, { degree: 11, dur: '2n', vel: 0.7 }, null, null, null, null, null, null, null]
            ]
        },
        effects: { probability: 0.0 }
    },
    Space: {
        bass: {
            grooves: [
                [{ degree: 0, dur: '1m', vel: 0.7 }, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
            ]
        },
        accompaniment: {
            grooves: [
                [{ degree: 0, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }, null, { degree: 7, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }, null, { degree: 0, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }, null, { degree: 7, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }, null]
            ],
            fills: [
                [{ degree: 2, dur: '2n', vel: 0.55 }, null, null, null, null, null, null, null, { degree: 5, dur: '2n', vel: 0.55 }, null, null, null, null, null, null, null]
            ]
        },
        melody: {
            grooves: [
                [null, null, null, null, null, null, null, null, { degree: 9, dur: '1n', vel: 0.6 }, null, null, null, null, null, null, null],
                [],
            ],
            fills: [
                 [null, null, { degree: 11, dur: '1n', vel: 0.65 }, null, null, null, null, null, null, null, null, null, null, null, null, null],
            ]
        },
        effects: { probability: 0.3 }
    },
};

// --- CORE LOGIC ---

function chooseNewPatternsForMeasure(measure: number) {
    const style = patternLibrary[currentStyle];
    if (!style) return;

    const chooseRandom = (arr: any[]) => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
    
    activePatterns.bass = chooseRandom(style.bass.grooves);
    
    const isFillMeasure = measure % 4 === 3;
    
    activePatterns.accompaniment = isFillMeasure && style.accompaniment.fills.length > 0 
        ? chooseRandom(style.accompaniment.fills)
        : chooseRandom(style.accompaniment.grooves);

    activePatterns.melody = isFillMeasure && style.melody.fills.length > 0
        ? chooseRandom(style.melody.fills)
        : chooseRandom(style.melody.grooves);
    
    if (enabledParts.effects && Math.random() < style.effects.probability) {
        const freq = getFrequencyFromDegree(Math.floor(Math.random() * 12) + 5, 'melody');
        if (freq) {
             self.postMessage({
                 type: 'playNote',
                 note: { type: 'autopilot_effects', freq, dur: '1n', vel: Math.random() * 0.3 + 0.2 },
             });
        }
    }
}


function tick() {
    const measure = Math.floor(tickCount / SUBDIVISIONS);
    const beatInMeasure = tickCount % SUBDIVISIONS;

    if (beatInMeasure === 0) {
        chooseNewPatternsForMeasure(measure);
    }
    
    const parts: ('bass' | 'accompaniment' | 'melody')[] = ['bass', 'accompaniment', 'melody'];
    for (const partName of parts) {
        if (!enabledParts[partName]) continue;

        const pattern: Pattern | null = activePatterns[partName];
        if (!pattern) continue;

        const noteData = pattern[beatInMeasure];
        if (noteData) {
            const freq = getFrequencyFromDegree(noteData.degree, partName);
            if (freq) {
                const noteEvent: NoteEvent = {
                    type: `autopilot_${partName}` as InstrumentPart,
                    freq: freq,
                    dur: noteData.dur,
                    vel: noteData.vel,
                };
                 self.postMessage({ type: 'playNote', note: noteEvent });
            }
        }
    }

    tickCount++;
}

function start() {
    if (timerId !== null) return;
    tickCount = 0;
    timerId = setInterval(tick, intervalTime) as any;
}

function stop() {
    if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
    }
}


// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            start();
            break;
        case 'stop':
            stop();
            break;
        case 'setTempo':
            intervalTime = (60 / data.bpm!) / (SUBDIVISIONS / 4); // Calculate 16th note interval
            if (timerId !== null) { // If timer is running, restart it with the new interval
                stop();
                start();
            }
            break;
        case 'setHarmony':
            currentKey = data.key;
            currentScale = data.scale;
            scaleIntervals = scaleIntervalMap[currentScale] || [];
            scaleFrequencies = {
                bass: getScaleFrequenciesForOctaves(currentKey, currentScale, data.bassOctaves),
                accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, data.accompanimentOctaves),
                melody: getScaleFrequenciesForOctaves(currentKey, currentScale, data.melodyOctaves),
            };
            tickCount = 0;
            break;
        case 'setParts':
            // This is a safe cast because the keys are identical
            enabledParts = data.parts as Record<AutopilotPart, boolean>;
            break;
        case 'setStyle':
            currentStyle = data.style;
            tickCount = 0;
            break;
    }
};

