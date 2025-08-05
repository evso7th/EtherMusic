
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
const totalNotesInLoop = chizhikMelody.length;

// --- CORE LOGIC ---
function tick(time: number) {
    if (!isRunning) return;

    // --- Play Bass ---
    // The bass part is independent of the melody index and based on the beat.
    // We get the beat number from the Transport's progress.
    const ticksInBeat = Tone.Transport.PPQ; // Pulses per quarter note
    const currentTick = Tone.Transport.ticks;
    const beatNumber = Math.floor(currentTick / ticksInBeat) % 4; // 0, 1, 2, 3 for a 4/4 measure

    // We only play on the downbeat of each beat, so we check if the tick is at the start of a beat
    if (currentTick % ticksInBeat === 0) {
        const bassNoteName = 'C2';
        
        if (beatNumber < 3) { // First three beats are quarter notes
            const bassEvent: NoteEvent = {
                part: 'bass',
                freq: Tone.Frequency(bassNoteName).toFrequency(),
                dur: '4n',
                vel: 0.9,
                time: time,
            };
            self.postMessage({ type: 'playNote', note: bassEvent });
        } else if (beatNumber === 3) { // Fourth beat has two 8th notes
            // First 8th note
            const firstEighth: NoteEvent = {
                part: 'bass',
                freq: Tone.Frequency(bassNoteName).toFrequency(),
                dur: '8n',
                vel: 0.9,
                time: time,
            };
            self.postMessage({ type: 'playNote', note: firstEighth });
            
            // Second 8th note, scheduled for the "and" of the 4th beat
            const secondEighth: NoteEvent = {
                part: 'bass',
                freq: Tone.Frequency(bassNoteName).toFrequency(),
                dur: '8n',
                vel: 0.8, // Slightly softer
                time: time + Tone.Time('8n').toSeconds(),
            };
            self.postMessage({ type: 'playNote', note: secondEighth });
        }
    }


    // --- Play Melody and Accompaniment ---
    // Make sure we only trigger this once per 8th note step
    const sixteenthsInStep = ticksInBeat / 2;
    if (currentTick % sixteenthsInStep === 0) {
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
        
        // --- Play random effect sound
        if (Math.random() < 0.05) { // 5% chance on each 8th note step
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
            if ('bpm' in data) {
                currentBpm = data.bpm as number;
                Tone.Transport.bpm.value = currentBpm;
            }
            break;
        case 'setHarmony':
            // Not used for fixed melody, but kept for future features.
            break;
    }
};
