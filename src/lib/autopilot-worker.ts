
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentPart } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type { AutopilotPart };

export type NoteEvent = {
    part: 'autopilot_melody'; // For now, only one part
    freq: number;
    dur: Unit.Time;
    vel: number;
    time: number; // Absolute time for playback
};

export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setTempo', bpm: number };


export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent };

// --- WORKER STATE ---
let isRunning = false;
let tickInterval: any = null;
let noteIndex = 0;
let scaleNotes: string[] = [];
let currentBpm: number = 90;

// --- MUSIC THEORY & UTILITIES ---
const scaleIntervalMap: { [key in MusicScale]: string[] } = {
    'Major': ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    'Minor': ['C4', 'D4', 'Eb4', 'F4', 'G4', 'Ab4', 'Bb4', 'C5'],
    'Major Pentatonic': ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
    'Minor Pentatonic': ['C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5'],
};

function updateScaleNotes(key: MusicKey, scale: MusicScale) {
    // Note: for simplicity, this example doesn't transpose the key yet.
    // It always uses the C Major scale notes.
    scaleNotes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
}


// --- CORE LOGIC ---
function tick() {
    if (!isRunning || scaleNotes.length === 0) return;

    // Calculate the time for the note to be played.
    // The main thread's Tone.now() is the source of truth, but we can't access it here.
    // So we just send the note and let the main thread schedule it immediately.
    // This is not perfect for timing, but it's the simplest approach without a complex scheduler.
    const noteToPlay = scaleNotes[noteIndex % scaleNotes.length];
    
    const noteEvent: NoteEvent = {
        part: 'autopilot_melody',
        freq: noteToPlay as unknown as number, // Tone.js can handle note names
        dur: '8n',
        vel: 0.8,
        time: 0, // Main thread will use Tone.now()
    };
    
    self.postMessage({ type: 'playNote', note: noteEvent });
    
    noteIndex++;
}


// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            if (isRunning) return;
            isRunning = true;
            noteIndex = 0;
            const intervalMs = (60 / currentBpm) * 1000 / 2; // 8th notes
            if (tickInterval) clearInterval(tickInterval);
            tickInterval = setInterval(tick, intervalMs);
            break;
        case 'stop':
            if (!isRunning) return;
            isRunning = false;
            if (tickInterval) {
                clearInterval(tickInterval);
                tickInterval = null;
            }
            break;
        case 'setHarmony':
             if ('key' in data && 'scale' in data) {
                updateScaleNotes(data.key as MusicKey, data.scale as MusicScale);
            }
            break;
        case 'setTempo':
            if ('bpm' in data) {
                currentBpm = data.bpm as number;
                // If running, restart the interval with the new tempo
                if (isRunning) {
                    if (tickInterval) clearInterval(tickInterval);
                    const intervalMs = (60 / currentBpm) * 1000 / 2; // 8th notes
                    tickInterval = setInterval(tick, intervalMs);
                }
            }
            break;
    }
};

// Initial setup
updateScaleNotes('C', 'Major');
