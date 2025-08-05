
import * as Tone from 'tone';
import type { MusicKey, MusicScale } from '@/app/page';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
// We now define parts for a more complex arrangement.
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
let noteIndex = 0;
let currentBpm: number = 90;

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

const noteDuration = '8n'; // Each note is an eighth note

// --- CORE LOGIC ---
function tick(time: number) {
    if (!isRunning) return;

    // Determine the current position in the melody loop
    const melody_idx = noteIndex % chizhikMelody.length;

    // --- Play Melody ---
    const melodyNoteName = chizhikMelody[melody_idx];
    if (melodyNoteName) {
        const melodyEvent: NoteEvent = {
            part: 'melody',
            freq: Tone.Frequency(melodyNoteName).toFrequency(),
            dur: noteDuration,
            vel: 0.7, // Melody is slightly louder
            time: time,
        };
        self.postMessage({ type: 'playNote', note: melodyEvent });
    }

    // --- Play Accompaniment ---
    const accompanimentNoteName = chizhikAccompaniment[melody_idx];
    if (accompanimentNoteName) {
        const accompanimentEvent: NoteEvent = {
            part: 'accompaniment',
            freq: Tone.Frequency(accompanimentNoteName).toFrequency(),
            dur: noteDuration,
            vel: 0.5, // Accompaniment is quieter
            time: time,
        };
        self.postMessage({ type: 'playNote', note: accompanimentEvent });
    }

    // --- Play random effect sound
    if (Math.random() < 0.05) { // 5% chance on each tick
        const effectEvent: NoteEvent = {
            part: 'effects',
            freq: 1000 + Math.random() * 2000, // High-pitched "sparkle"
            dur: '4n',
            vel: 0.1 + Math.random() * 0.2, // Random, quiet velocity
            time: time
        };
        self.postMessage({ type: 'playNote', note: effectEvent });
    }
    
    // Move to the next note index
    noteIndex++;
}

// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            isRunning = true;
            noteIndex = 0; // Reset melody on start
            break;
        case 'stop':
            isRunning = false;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setTempo':
            if ('bpm' in data) {
                currentBpm = data.bpm as number;
                // We can use this in the future to adjust note durations, etc.
            }
            break;
        case 'setHarmony':
            // This is not used for the fixed melody, but is kept for future features.
            break;
    }
};
