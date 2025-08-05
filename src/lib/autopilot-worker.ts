
import * as Tone from 'tone';
import type { MusicKey, MusicScale } from '@/app/page';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotPart = 'melody' | 'accompaniment' | 'bass' | 'effects';

export type NoteEvent = {
    part: AutopilotPart;
    freq: number;
    dur: Unit.Time;
    vel: number;
    time: number; // Absolute time for playback
};

export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'tick', time: number }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setTempo', bpm: number };

export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent };

// --- WORKER STATE ---
let isRunning = false;
let noteIndex = 0; // Simple counter, driven by external ticks

// --- MUSIC DATA: "Чижик-Пыжик" ---
// Voice 1 (Melody)
const chizhikMelody: (string | null)[] = [
    'G4', 'G4', 'A4', 'B4', 'B4', 'A4', 'G4', 'F#4',
    'E4', 'E4', 'F#4', 'G4', 'G4', 'F#4', 'E4', 'D4',
    'G4', 'G4', 'A4', 'B4', 'B4', 'A4', 'G4', 'F#4',
    'E4', 'E4', 'F#4', 'G4', 'G4', 'F#4', 'E4', 'D4',
    'G4', 'D4', 'G4', 'D4', 'G4', 'A4', 'B4', null,
    'C5', 'G4', 'C5', 'G4', 'C5', 'B4', 'A4', null,
];

// Voice 2 (Accompaniment)
const chizhikAccompaniment: (string | null)[] = [
    'C4', null, 'C4', null, 'G3', null, 'C4', null,
    'C4', null, 'D4', null, 'G3', null, 'G3', null,
    'C4', null, 'C4', null, 'G3', null, 'C4', null,
    'C4', null, 'D4', null, 'G3', null, 'G3', null,
    'B3', null, 'C4', null, 'D4', 'E4', 'G4', null,
    'A4', null, 'B4', null, 'A4', 'G4', 'F#4', null,
];

const noteDuration = '8n';
const totalNotesInLoop = chizhikMelody.length;

// --- CORE LOGIC ---
function tick(time: number) {
    if (!isRunning) return;

    // --- Play Melody and Accompaniment using the simple index ---
    const loopPosition = noteIndex % totalNotesInLoop;
    
    const melodyNoteName = chizhikMelody[loopPosition];
    if (melodyNoteName) {
        const melodyEvent: NoteEvent = {
            part: 'melody',
            freq: Tone.Frequency(melodyNoteName).toFrequency(),
            dur: noteDuration,
            vel: 0.7,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: melodyEvent });
    }

    const accompanimentNoteName = chizhikAccompaniment[loopPosition];
    if (accompanimentNoteName) {
        const accompanimentEvent: NoteEvent = {
            part: 'accompaniment',
            freq: Tone.Frequency(accompanimentNoteName).toFrequency(),
            dur: noteDuration,
            vel: 0.5,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: accompanimentEvent });
    }

    // --- Play Bass Part on the first beat of every measure ---
    const ticksPerMeasure = 8; // 8 ticks of '8n' per 4/4 measure
    const isFirstBeat = (noteIndex % ticksPerMeasure) === 0;

    if (isFirstBeat) {
        const bassEvent: NoteEvent = {
            part: 'bass',
            freq: Tone.Frequency('C2').toFrequency(),
            dur: '4n',
            vel: 0.9,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: bassEvent });
    }
    
    // --- Play random effect sound ---
    if (Math.random() < 0.05) { 
        const effectEvent: NoteEvent = {
            part: 'effects',
            freq: 1000 + Math.random() * 2000,
            dur: '4n',
            vel: 0.1 + Math.random() * 0.2,
            time: time
        };
        self.postMessage({ type: 'playNote', note: effectEvent });
    }

    // Increment the master index for the next tick
    noteIndex++;
}

// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            isRunning = true;
            noteIndex = 0; // Reset index on start
            break;
        case 'stop':
            isRunning = false;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setTempo':
            // Tempo is handled by the main thread via the tick rate.
            break;
        case 'setHarmony':
            // Not used for fixed melody, but kept for future features.
            break;
    }
};
