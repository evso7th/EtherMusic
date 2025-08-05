
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
let noteIndex = 0; // Simple counter for melody, driven by external 8n ticks
let tick16n = 0; // Separate counter for accompaniment, driven by external 16n ticks

// --- MUSIC DATA: "Чижик-Пыжик" ---
const chizhikMelody: (string | null)[] = [
    'G4', 'G4', 'A4', 'B4', 'B4', 'A4', 'G4', 'F#4',
    'E4', 'E4', 'F#4', 'G4', 'G4', 'F#4', 'E4', 'D4',
];
const melodyNoteDuration = '8n';
const totalMelodyNotesInLoop = chizhikMelody.length;

// --- Accompaniment Data ---
const chordProgression: { [key: number]: string } = {
    0: 'G',  // Measure 1
    1: 'G',
    2: 'D7', // Measure 2
    3: 'D7',
    4: 'G',  // Measure 3
    5: 'G',
    6: 'C',  // Measure 4
    7: 'C',
    8: 'G',  // Measure 5
    9: 'G',
    10: 'D7', // Measure 6
    11: 'D7',
    12: 'G', // Measure 7
    13: 'G',
    14: 'D7', // Measure 8
    15: 'D7'
};

const chordDefs: { [key: string]: { notes: string[], passing: string[] } } = {
    'G': { notes: ['G3', 'B3', 'D4'], passing: ['A3', 'C4'] },
    'D7': { notes: ['D3', 'F#3', 'A3', 'C4'], passing: ['E3', 'G3'] },
    'C': { notes: ['C3', 'E3', 'G3'], passing: ['D3', 'F3'] }
};

const accompanimentNoteDuration = '16n';
const ticksPerMeasure = 16; // 16n ticks

// --- CORE LOGIC ---
function tick(time: number) {
    if (!isRunning) return;

    const melodyLoopPosition = Math.floor(tick16n / 2) % totalMelodyNotesInLoop;
    const currentMeasure = Math.floor(tick16n / ticksPerMeasure) % 16; // Loop progression every 16 measures
    const tickInMeasure = tick16n % ticksPerMeasure;

    // --- Play Melody Part (Every other 16n tick to make an 8n) ---
    if (tick16n % 2 === 0) {
        const melodyNoteName = chizhikMelody[melodyLoopPosition];
        if (melodyNoteName) {
            const melodyEvent: NoteEvent = {
                part: 'melody',
                freq: Tone.Frequency(melodyNoteName).toFrequency(),
                dur: melodyNoteDuration,
                vel: 0.6,
                time: time,
            };
            self.postMessage({ type: 'playNote', note: melodyEvent });
        }
    }
    
    // --- Play Accompaniment Part ---
    const currentChordName = chordProgression[currentMeasure];
    const chord = chordDefs[currentChordName];
    if(chord) {
        // Simple ascending arpeggio
        const noteToPlayIndex = tickInMeasure % chord.notes.length;
        let noteName = chord.notes[noteToPlayIndex];

        // Occasionally insert a passing tone on an off-beat
        if (tickInMeasure % 4 !== 0 && Math.random() < 0.25) {
             const passingNoteIndex = Math.floor(Math.random() * chord.passing.length);
             noteName = chord.passing[passingNoteIndex];
        }

        const accompanimentEvent: NoteEvent = {
            part: 'accompaniment',
            freq: Tone.Frequency(noteName).toFrequency(),
            dur: accompanimentNoteDuration,
            vel: 0.35,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: accompanimentEvent });
    }

    // --- Play Bass Part ---
    // Measure is `noteIndex / 8` because bass runs on 8n ticks
    const bassMeasure = Math.floor(noteIndex / 8); 
    const tickInBassMeasure = noteIndex % 8; // 8 ticks of 8n per measure

    // Play on the 2nd beat (tick 2) and 3rd beat (ticks 4 & 5) of specific measures
    if (bassMeasure % 4 === 1 && tickInBassMeasure === 0) { // On the first tick of the second measure
        const bassNote: NoteEvent = {
            part: 'bass',
            freq: Tone.Frequency('G1').toFrequency(),
            dur: '4n',
            vel: 0.9,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: bassNote });
    } else if (bassMeasure % 4 === 2) { // In the third measure
        if (tickInBassMeasure === 0) { // First beat
             const bassNote1: NoteEvent = {
                part: 'bass',
                freq: Tone.Frequency('G1').toFrequency(),
                dur: '8n',
                vel: 0.9,
                time: time,
            };
            self.postMessage({ type: 'playNote', note: bassNote1 });
        } else if (tickInBassMeasure === 2) { // Second beat
             const bassNote2: NoteEvent = {
                part: 'bass',
                freq: Tone.Frequency('G1').toFrequency(),
                dur: '8n',
                vel: 0.8,
                time: time,
            };
            self.postMessage({ type: 'playNote', note: bassNote2 });
        }
    }

    // --- Play random effect sound ---
    if (Math.random() < 0.01) { 
        const effectEvent: NoteEvent = {
            part: 'effects',
            freq: 1000 + Math.random() * 2000,
            dur: '4n',
            vel: 0.1 + Math.random() * 0.2,
            time: time
        };
        self.postMessage({ type: 'playNote', note: effectEvent });
    }
    
    // Increment counters
    if (tick16n % 2 === 0) {
        noteIndex++;
    }
    tick16n++;
}

// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            isRunning = true;
            noteIndex = 0;
            tick16n = 0;
            break;
        case 'stop':
            isRunning = false;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setTempo':
            // Tempo changes are handled by the main thread's Transport scheduling rate
            break;
        case 'setHarmony':
            // For now, harmony is fixed to G Major for Chizhik
            break;
    }
};

    