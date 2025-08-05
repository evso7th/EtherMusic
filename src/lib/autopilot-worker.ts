
import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotPart = 'melody' | 'effects'; // Added 'effects'

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
    scaleFrequencies = [...notesInOctave4, ...notesInOctave5].sort((a,b) => a-b);
}

// --- CORE LOGIC ---
function tick(time: number) {
    if (!isRunning || scaleFrequencies.length === 0) return;

    // With a small probability, generate an effect instead of a melody note
    if (Math.random() < 0.1) {
        const effectFreq = 1000 + Math.random() * 2000; // High-pitched "star"
        const effectEvent: NoteEvent = {
            part: 'effects',
            freq: effectFreq,
            dur: '1n',
            vel: Math.random() * 0.1 + 0.1,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: effectEvent });
    } else {
        const noteToPlayFreq = scaleFrequencies[noteIndex % scaleFrequencies.length];
        
        const noteEvent: NoteEvent = {
            part: 'melody',
            freq: noteToPlayFreq,
            dur: '8n',
            vel: Math.random() * 0.3 + 0.5,
            time: time,
        };
        
        self.postMessage({ type: 'playNote', note: noteEvent });
        
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
        case 'setHarmony':
             if ('key' in data && 'scale' in data) {
                updateScaleNotes(data.key as MusicKey, data.scale as MusicScale);
            }
            break;
        case 'setTempo':
            if ('bpm' in data) {
                currentBpm = data.bpm as number;
            }
            break;
    }
};

// Initial setup
updateScaleNotes('C', 'Major Pentatonic');
