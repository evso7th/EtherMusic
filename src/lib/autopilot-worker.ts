
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
const chizhikMelody: (string | null)[] = [
    'G4', 'G4', 'A4', 'B4', 'B4', 'A4', 'G4', 'F#4',
    'E4', 'E4', 'F#4', 'G4', 'G4', 'F#4', 'E4', 'D4',
    'G4', 'G4', 'A4', 'B4', 'B4', 'A4', 'G4', 'F#4',
    'E4', 'E4', 'F#4', 'G4', 'G4', 'F#4', 'E4', 'D4',
    'G4', 'D4', 'G4', 'D4', 'G4', 'A4', 'B4', null,
    'C5', 'G4', 'C5', 'G4', 'C5', 'B4', 'A4', null,
];

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

    // --- Play Melody and Accompaniment (Guitarist) ---
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

    // --- Play Bass Part on specific beats ---
    // Total ticks in a 4/4 measure, with our '8n' tick rate
    const ticksPerMeasure = 8; 
    const currentTickInMeasure = noteIndex % ticksPerMeasure;
    
    // Play on the second beat (tick 2) and third beat (ticks 4 and 5)
    if (currentTickInMeasure === 2) { // Second beat
        const bassNote: NoteEvent = {
            part: 'bass',
            freq: Tone.Frequency('C2').toFrequency(),
            dur: '4n',
            vel: 0.9,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: bassNote });
    } else if (currentTickInMeasure === 4) { // Third beat
        const bassNote1: NoteEvent = {
            part: 'bass',
            freq: Tone.Frequency('C2').toFrequency(),
            dur: '8n',
            vel: 0.9,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: bassNote1 });
        
        // The second "boom" is scheduled by the AudioEngine, so we just send another event for a later time.
        // But since our tick() is called for every 8n, it's easier to just trigger it on the next tick.
    } else if (currentTickInMeasure === 5) {
         const bassNote2: NoteEvent = {
            part: 'bass',
            freq: Tone.Frequency('C2').toFrequency(),
            dur: '8n',
            vel: 0.8,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: bassNote2 });
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

    noteIndex++;
}

// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            isRunning = true;
            noteIndex = 0;
            break;
        case 'stop':
            isRunning = false;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setTempo':
            break;
        case 'setHarmony':
            break;
    }
};
