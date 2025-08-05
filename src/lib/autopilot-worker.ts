
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
    // New property for simplified worker
    timingOffset: number; // in seconds from the start of the scheduled block
};

export type WorkerEvent =
    | { type: 'generateNotes' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setTempo', bpm: number };


export type WorkerResponse =
    | { type: 'notesGenerated', notes: NoteEvent[], scheduleTime: number };

// --- WORKER STATE ---
let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentBpm: number = 90;
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
    if (scaleIntervals.length === 0) return null;
    const scaleLength = scaleIntervals.length;
    const octave = baseOctave + Math.floor(degree / scaleLength);
    const interval = scaleIntervals[degree % scaleLength];
    return getNoteFrequency(currentKey, octave, interval);
}

// --- CORE LOGIC ---
function generateNotes(): NoteEvent[] {
    const notes: NoteEvent[] = [];
    const baseOctave = 3;
    const measureDurationSeconds = (60 / currentBpm) * 4;

    // Simple pattern: play root note on bass, and 3rd and 5th on melody
    const rootFreq = getFrequencyFromDegree(0, baseOctave);
    const thirdFreq = getFrequencyFromDegree(2, baseOctave + 1);
    const fifthFreq = getFrequencyFromDegree(4, baseOctave + 1);

    // Bass note at the beginning of the measure
    if (rootFreq) {
        notes.push({
            part: 'autopilot_bass',
            freq: rootFreq,
            dur: '1n',
            vel: 0.7,
            timingOffset: 0
        });
    }

    // Melody notes on 2nd and 3rd beats
    if (thirdFreq) {
        notes.push({
            part: 'autopilot_melody',
            freq: thirdFreq,
            dur: '4n',
            vel: 0.5,
            timingOffset: measureDurationSeconds / 4 // 2nd beat
        });
    }
     if (fifthFreq) {
        notes.push({
            part: 'autopilot_melody',
            freq: fifthFreq,
            dur: '4n',
            vel: 0.5,
            timingOffset: (measureDurationSeconds / 4) * 2 // 3rd beat
        });
    }

    return notes;
}


// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'generateNotes':
            const notes = generateNotes();
            // Tell the main thread to schedule these notes in 0 seconds (i.e., on the next beat)
            self.postMessage({ type: 'notesGenerated', notes, scheduleTime: 0 });
            break;
        case 'setHarmony':
             if ('key' in data && 'scale' in data) {
                currentKey = data.key as MusicKey;
                currentScale = data.scale as MusicScale;
                scaleIntervals = scaleIntervalMap[currentScale] || [];
            }
            break;
        case 'setTempo':
            if ('bpm' in data) {
                currentBpm = data.bpm as number;
            }
            break;
    }
};

    