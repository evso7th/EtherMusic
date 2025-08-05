
import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotPart = 'melody'; // Simplified for now

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
let scaleFrequencies: number[] = [];
let currentBpm: number = 90;

// --- MUSIC THEORY & UTILITIES ---
function updateScaleNotes(key: MusicKey, scale: MusicScale) {
    const scaleIntervals: { [key in MusicScale]: string[] } = {
        'Major': ['0', '2', '4', '5', '7', '9', '11'],
        'Minor': ['0', '2', '3', '5', '7', '8', '10'],
        'Major Pentatonic': ['0', '2', '4', '7', '9'],
        'Minor Pentatonic': ['0', '3', '5', '7', '10'],
    };
    const intervals = scaleIntervals[scale];
    const notesInOctave4 = intervals.map(interval => Tone.Frequency(key + '4').transpose(parseInt(interval)).toFrequency());
    const notesInOctave5 = intervals.map(interval => Tone.Frequency(key + '5').transpose(parseInt(interval)).toFrequency());
    scaleFrequencies = [...notesInOctave4, notesInOctave5[0]].sort((a,b) => a-b);
}

// --- CORE LOGIC ---
function tick(time: number) {
    // Only generate a note if the worker is running
    if (!isRunning || scaleFrequencies.length === 0) return;

    const noteToPlayFreq = scaleFrequencies[noteIndex % scaleFrequencies.length];
    
    const noteEvent: NoteEvent = {
        part: 'melody',
        freq: noteToPlayFreq,
        dur: '8n',
        vel: Math.random() * 0.3 + 0.5, // Add some velocity variation
        time: time, // The exact time is provided by the main thread's Transport
    };
    
    // Post the note back to the main thread
    self.postMessage({ type: 'playNote', note: noteEvent });
    
    noteIndex++;
}

// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            isRunning = true;
            noteIndex = 0; // Reset sequence on start
            break;
        case 'stop':
            isRunning = false;
            break;
        case 'tick':
            // Directly call tick with the time from the main thread
            tick(data.time);
            break;
        case 'setHarmony':
             if ('key' in data && 'scale' in data) {
                updateScaleNotes(data.key as MusicKey, data.scale as MusicScale);
            }
            break;
        case 'setTempo':
            // The worker no longer needs to know the tempo, as it's driven by external ticks.
            // We can keep this for future use if needed.
            if ('bpm' in data) {
                currentBpm = data.bpm as number;
            }
            break;
    }
};

// Initial setup
updateScaleNotes('C', 'Major Pentatonic');
