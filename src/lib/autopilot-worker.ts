

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentPart } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type { AutopilotPart };

export type NoteEvent = {
    part: InstrumentPart;
    freq: number;
    dur: Unit.Time;
    vel: number;
    measure: number; // The measure this note belongs to
    subdivision: number; // The 16th note subdivision within the measure
};

export type WorkerEvent =
    | { type: 'generateMeasure', measure: number }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setParts', parts: Record<AutopilotPart, boolean> }
    | { type: 'reset' };

export type WorkerResponse =
    | { type: 'measureGenerated', notes: NoteEvent[], measure: number };


// --- MUSICAL PATTERN DEFINITIONS ---

type PatternNote = {
    degree: number;
    dur: Unit.Time;
    vel: number;
    octaveOffset?: number;
};

type Pattern = (PatternNote | null)[];

interface StylePatterns {
    bass: { grooves: Pattern[] };
    accompaniment: { grooves: Pattern[], fills: Pattern[] };
    melody: { grooves: Pattern[], fills: Pattern[] };
    effects: { probability: number; }
    baseOctaves: {
        bass: number;
        accompaniment: number;
        melody: number;
    }
}

// --- WORKER STATE ---
const SUBDIVISIONS = 16;

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let enabledParts: Record<AutopilotPart, boolean> = { bass: true, accompaniment: true, melody: true, effects: true };
let scaleIntervals: number[] = [];

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

function getFrequencyFromDegree(degree: number, baseOctave: number): number | null {
    const scaleLength = scaleIntervals.length;
    if (!scaleLength) return null;

    const octave = baseOctave + Math.floor(degree / scaleLength);
    const interval = scaleIntervals[degree % scaleLength];
    
    return getNoteFrequency(currentKey, octave, interval);
}


// --- PATTERN LIBRARY ---

const patternLibrary: Record<AutopilotStyle, StylePatterns> = {
    Ambient: {
        baseOctaves: { bass: 2, accompaniment: 3, melody: 4 },
        bass: { grooves: [[{ degree: 0, dur: '1m', vel: 0.7 }]] },
        accompaniment: { 
            grooves: [[{ degree: 0, dur: '2n', vel: 0.4 }, null, null, null, null, null, null, null, { degree: 4, dur: '2n', vel: 0.4 }]] ,
            fills: [[{ degree: 2, dur: '1n', vel: 0.5 }]]
        },
        melody: { 
            grooves: [[null, null, null, { degree: 7, dur: '2n', vel: 0.6 }, null, null, null, null, null, null, { degree: 9, dur: '2n', vel: 0.6 }]],
            fills: [[null, null, { degree: 11, dur: '1n', vel: 0.65 }]]
        },
        effects: { probability: 0.1 }
    },
    Trance: {
        baseOctaves: { bass: 2, accompaniment: 4, melody: 5 },
        bass: { grooves: [[{ degree: 0, dur: '4n', vel: 0.9 }, null, null, null, { degree: 0, dur: '4n', vel: 0.9 }, null, null, null, { degree: 0, dur: '4n', vel: 0.9 }, null, null, null, { degree: 0, dur: '4n', vel: 0.9 }]] },
        accompaniment: {
            grooves: [[null, null, { degree: 4, dur: '8n', vel: 0.5 }, null, null, null, { degree: 5, dur: '8n', vel: 0.5 }, null, null, null, { degree: 4, dur: '8n', vel: 0.5 }, null, null, null, { degree: 7, dur: '8n', vel: 0.5 }]],
            fills: [[null, null, { degree: 7, dur: '4n', vel: 0.6 }, null, null, null, { degree: 9, dur: '4n', vel: 0.6 }, null, null, null, { degree: 11, dur: '4n', vel: 0.6 }, null, { degree: 12, dur: '4n', vel: 0.6 }]]
        },
        melody: {
            grooves: [[null, null, null, null, null, { degree: 7, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 7, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 11, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }]],
            fills: [[{ degree: 12, dur: '4n', vel: 0.8 }, null, null, null, { degree: 11, dur: '4n', vel: 0.8 }, null, null, null, { degree: 9, dur: '4n', vel: 0.8 }, null, null, null, { degree: 7, dur: '4n', vel: 0.8 }]]
        },
        effects: { probability: 0.05 }
    },
    Sequence: {
        baseOctaves: { bass: 2, accompaniment: 4, melody: 5 },
        bass: { grooves: [[{ degree: 0, dur: '2n', vel: 0.8 }, null, null, null, null, null, null, null, { degree: 0, dur: '2n', vel: 0.8 }]] },
        accompaniment: { 
            grooves: [[{ degree: 0, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 5, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 0, dur: '16n', vel: 0.5 }, null, { degree: 0, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 5, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 0, dur: '16n', vel: 0.5 }, null ]],
            fills: [[{ degree: 7, dur: '8n', vel: 0.6 }, null, { degree: 9, dur: '8n', vel: 0.6 }, null, { degree: 11, dur: '8n', vel: 0.6 }, null, { degree: 9, dur: '8n', vel: 0.6 }, null, { degree: 7, dur: '8n', vel: 0.6 }, null, { degree: 5, dur: '8n', vel: 0.6 }, null, { degree: 4, dur: '8n', vel: 0.6 }, null, { degree: 2, dur: '8n', vel: 0.6 }, null,]]
        },
        melody: {
            grooves: [[null, null, null, null, { degree: 7, dur: '4n', vel: 0.7 }, null, null, null, null, null, null, null, { degree: 9, dur: '4n', vel: 0.7 }]],
            fills: [[{ degree: 12, dur: '2n', vel: 0.75 }, null, null, null, null, null, null, null, { degree: 11, dur: '2n', vel: 0.75 }]]
        },
        effects: { probability: 0.15 }
    },
    Chimes: {
        baseOctaves: { bass: 3, accompaniment: 4, melody: 5 },
        bass: { grooves: [[{ degree: 0, dur: '1n', vel: 0.7}]] },
        accompaniment: {
            grooves: [[null, { degree: 4, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5}, null, { degree: 11, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5}, null, { degree: 4, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5}, null, { degree: 11, dur: '8n', vel: 0.5}, null, { degree: 7, dur: '8n', vel: 0.5} ]],
            fills: [[{ degree: 2, dur: '4n', vel: 0.6 }, null, null, null, { degree: 5, dur: '4n', vel: 0.6 }, null, null, null, { degree: 7, dur: '4n', vel: 0.6 }, null, null, null, { degree: 10, dur: '4n', vel: 0.6 }]]
        },
        melody: {
            grooves: [[null, null, null, null, null, null, null, { degree: 12, dur: '2n', vel: 0.7 }]],
            fills: [[{ degree: 14, dur: '1n', vel: 0.8}]]
        },
        effects: { probability: 0.25 }
    },
     Drone: {
        baseOctaves: { bass: 2, accompaniment: 3, melody: 4 },
        bass: { grooves: [[{ degree: 0, dur: '1m', vel: 0.6 }, null, null, null, null, null, null, null, { degree: -5, dur: '1m', vel: 0.6 }]] },
        accompaniment: { grooves: [[]], fills: [[]] },
        melody: { grooves: [[]], fills: [[]] },
        effects: { probability: 0.4 }
    },
    Toccata: {
        baseOctaves: { bass: 2, accompaniment: 3, melody: 4 },
        bass: { grooves: [[{ degree: 0, dur: '2n', vel: 0.9 }, null, null, null, null, null, null, null, { degree: -2, dur: '2n', vel: 0.85 }]] },
        accompaniment: {
            grooves: [
                [ { degree: 0, dur: '16n', vel: 0.6 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.6 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 5, dur: '16n', vel: 0.6 }, { degree: 4, dur: '16n', vel: 0.5 }, { degree: 7, dur: '16n', vel: 0.6 }, { degree: 5, dur: '16n', vel: 0.5 }, { degree: 4, dur: '16n', vel: 0.6 }, { degree: 2, dur: '16n', vel: 0.5 }, { degree: 0, dur: '16n', vel: 0.6 } ]
            ],
            fills: [
                [ { degree: 7, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 11, dur: '8n', vel: 0.7 }, null, { degree: 12, dur: '8n', vel: 0.7 }, null, { degree: 11, dur: '8n', vel: 0.7 }, null, { degree: 9, dur: '8n', vel: 0.7 }, null, { degree: 7, dur: '8n', vel: 0.7 } ],
            ]
        },
        melody: {
            grooves: [
                [ null, null, null, null, null, null, null, null, { degree: 12, dur: '2n.', vel: 0.8 } ]
            ],
            fills: [
                [ { degree: 12, dur: '16n', vel: 0.8 }, { degree: 11, dur: '16n', vel: 0.8 }, { degree: 12, dur: '16n', vel: 0.8 }, { degree: 9, dur: '16n', vel: 0.8 }, { degree: 7, dur: '16n', vel: 0.8 }, null, null, null, { degree: 5, dur: '2n', vel: 0.8 } ]
            ]
        },
        effects: { probability: 0.1 }
    },
    Promenade: {
        baseOctaves: { bass: 2, accompaniment: 3, melody: 4 },
        bass: {
            grooves: [
                [{ degree: 0, dur: '4n', vel: 0.8 }, null, null, null, { degree: 0, dur: '4n', vel: 0.8 }, null, null, null, { degree: -3, dur: '4n', vel: 0.75 }, null, null, null, { degree: -3, dur: '4n', vel: 0.75 }]
            ]
        },
        accompaniment: {
            grooves: [
                [null, null, { degree: 4, dur: '4n', vel: 0.6 }, null, null, null, { degree: 5, dur: '4n', vel: 0.6 }, null, null, null, { degree: 0, dur: '4n', vel: 0.6 }, null, null, null, { degree: 2, dur: '4n', vel: 0.6 }]
            ],
            fills: [
                [{ degree: 7, dur: '2n', vel: 0.65 }, null, null, null, null, null, null, null, { degree: 5, dur: '2n', vel: 0.65 }]
            ]
        },
        melody: {
            grooves: [
                 [null, null, null, null, { degree: 9, dur: '1n', vel: 0.7 }]
            ],
            fills: [
                [{ degree: 12, dur: '2n', vel: 0.7 }, null, null, null, null, null, null, null, { degree: 11, dur: '2n', vel: 0.7 }]
            ]
        },
        effects: { probability: 0.0 }
    },
    Space: {
        baseOctaves: { bass: 2, accompaniment: 3, melody: 4 },
        bass: {
            grooves: [
                [{ degree: 0, dur: '1m', vel: 0.7 }]
            ]
        },
        accompaniment: {
            grooves: [
                [{ degree: 0, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }, null, { degree: 7, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }, null, { degree: 0, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }, null, { degree: 7, dur: '8n', vel: 0.5 }, null, { degree: 4, dur: '8n', vel: 0.5 }]
            ],
            fills: [
                [{ degree: 2, dur: '2n', vel: 0.55 }, null, null, null, null, null, null, null, { degree: 5, dur: '2n', vel: 0.55 }]
            ]
        },
        melody: {
            grooves: [
                [null, null, null, null, null, null, null, null, { degree: 9, dur: '1n', vel: 0.6 }],
            ],
            fills: [
                 [null, null, { degree: 11, dur: '1n', vel: 0.65 }],
            ]
        },
        effects: { probability: 0.3 }
    },
};

// --- CORE LOGIC ---

function generateMeasure(measure: number): NoteEvent[] {
    const style = patternLibrary[currentStyle];
    if (!style) return [];

    const notes: NoteEvent[] = [];

    const chooseRandom = (arr: any[]) => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
    
    const isFillMeasure = measure % 4 === 3;

    const parts: ('bass' | 'accompaniment' | 'melody')[] = ['bass', 'accompaniment', 'melody'];
    for (const partName of parts) {
        if (!enabledParts[partName]) continue;

        const partStyle = style[partName as keyof typeof style] as any;
        const pattern: Pattern | null = (isFillMeasure && partStyle.fills?.length > 0)
            ? chooseRandom(partStyle.fills)
            : chooseRandom(partStyle.grooves);
        
        if (!pattern) continue;

        pattern.forEach((noteData, i) => {
            if (noteData) {
                const freq = getFrequencyFromDegree(noteData.degree, style.baseOctaves[partName]);
                if (freq) {
                    notes.push({
                        part: `autopilot_${partName}` as InstrumentPart,
                        freq,
                        dur: noteData.dur,
                        vel: noteData.vel,
                        measure,
                        subdivision: i,
                    });
                }
            }
        });
    }

    if (enabledParts.effects && Math.random() < style.effects.probability) {
        const subdivision = Math.floor(Math.random() * SUBDIVISIONS);
        const freq = getFrequencyFromDegree(Math.floor(Math.random() * 12) + 5, style.baseOctaves.melody);
        if (freq) {
             notes.push({
                 part: 'autopilot_effects', freq, dur: '1n', vel: Math.random() * 0.3 + 0.2, measure, subdivision
             });
        }
    }
    
    return notes;
}

// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'generateMeasure':
            const notes = generateMeasure(data.measure);
            self.postMessage({ type: 'measureGenerated', notes, measure: data.measure });
            break;
        case 'setHarmony':
            currentKey = data.key;
            currentScale = data.scale;
            scaleIntervals = scaleIntervalMap[currentScale] || [];
            break;
        case 'setParts':
            enabledParts = data.parts as Record<AutopilotPart, boolean>;
            break;
        case 'setStyle':
            currentStyle = data.style;
            break;
        case 'reset':
            // Could add logic here to reset any internal state if needed
            break;
    }
};
