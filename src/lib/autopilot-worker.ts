
// src/lib/autopilot-worker.ts
import { getScaleFrequencies, SCALES, ALL_NOTES } from './music';
import type { MusicKey, MusicScale, AutopilotPart, NoteEvent, NoteUpdateEvent, WorkerEvent, WorkerResponse } from '@/types';


// --- WORKER STATE ---
let state = {
    isRunning: false,
    tickCount: 0,
    currentKey: 'G' as MusicKey,
    currentScale: 'Major' as MusicScale,
    currentBpm: 90,
    density: 0.5, // 0 to 1
    scaleFrequencies: {
        melody: [] as number[],
        accompaniment: [] as number[],
        bass: [] as number[],
    },
    melodyState: {
        currentNoteIndex: 3,
        lastNoteTime: 0
    },
    bassState: {
        currentNoteIndex: 0,
        lastNoteTime: 0,
        noteId: 1000
    },
    accompanimentState: {
        lastNoteTime: 0,
        currentChordIndex: 0
    }
};

function updateScaleFrequencies() {
    const baseMidiNote = 60 + ALL_NOTES[state.currentKey]; // C4 is MIDI 60
    const scale = SCALES[state.currentScale];

    state.scaleFrequencies.melody = getScaleFrequencies(baseMidiNote, scale, [0, 1]);
    state.scaleFrequencies.accompaniment = getScaleFrequencies(baseMidiNote, scale, [-1, 0, 1]);
    state.scaleFrequencies.bass = getScaleFrequencies(baseMidiNote, scale, [-2, -1]);
}


// Initialize scales on load
updateScaleFrequencies();

// --- AUTOPILOT LOGIC ---

function generateMelody(time: number): NoteEvent[] {
    const { melody } = state.scaleFrequencies;
    if (melody.length === 0) return [];
    
    // Play a new note with a probability based on density
    if (Math.random() > (1.0 - state.density * 0.5)) {
        // Move to a nearby note in the scale
        const step = Math.random() < 0.5 ? -1 : 1;
        state.melodyState.currentNoteIndex = (state.melodyState.currentNoteIndex + step + melody.length) % melody.length;
        
        const freq = melody[state.melodyState.currentNoteIndex];
        const duration = ['8n', '4n', '4n.', '2n'][Math.floor(Math.random() * 4)];

        return [{
            part: 'melody',
            freq: freq,
            dur: duration,
            vel: 0.3 + Math.random() * 0.3, // Velocity between 0.3 and 0.6
            time: time,
        }];
    }
    return [];
}

function generateBass(time: number): NoteEvent[] {
     const { bass } = state.scaleFrequencies;
    if (bass.length === 0) return [];

    // Trigger a new bass note on the first beat of a measure
    const beatsPerMeasure = 4;
    const ticksPerBeat = 4; // 16th notes
    if (state.tickCount % (beatsPerMeasure * ticksPerBeat) === 0) {
        // Simple root note movement
        state.bassState.currentNoteIndex = (state.bassState.currentNoteIndex + (Math.random() > 0.7 ? 1 : 0)) % (bass.length / 2);
        const freq = bass[state.bassState.currentNoteIndex];
        
        return [{
            id: state.bassState.noteId++,
            part: 'bass',
            freq: freq,
            dur: '1m',
            vel: 0.6,
            time: time,
        }];
    }
    return [];
}

function generateAccompaniment(time: number): NoteEvent[] {
    const { accompaniment } = state.scaleFrequencies;
    if (accompaniment.length === 0) return [];

    // Play a new chord with a probability based on density
    if (state.tickCount % 8 === 0 && Math.random() < state.density) {
        const chordSize = 2 + Math.floor(Math.random() * 2); // 2 or 3 notes
        const chordNotes: NoteEvent[] = [];
        
        let startIndex = Math.floor(Math.random() * (accompaniment.length - chordSize));
        
        for (let i = 0; i < chordSize; i++) {
             // Stagger the notes slightly for a more natural feel
            const noteTime = time + i * 0.05;
            chordNotes.push({
                part: 'accompaniment',
                freq: accompaniment[startIndex + i],
                dur: '2n',
                vel: 0.2 + Math.random() * 0.2,
                time: noteTime
            });
        }
        return chordNotes;
    }
    return [];
}


function tick(time: number) {
    if (!state.isRunning) return;

    let notesToPlay: NoteEvent[] = [];

    notesToPlay.push(...generateMelody(time));
    notesToPlay.push(...generateBass(time));
    notesToPlay.push(...generateAccompaniment(time));

    // Send any generated notes back to the main thread in a batch
    if (notesToPlay.length > 0) {
        self.postMessage({ type: 'playNotesBatch', notes: notesToPlay } as WorkerResponse);
    }

    state.tickCount++;
}

// --- MESSAGE HANDLER (Boilerplate) ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            console.log("[Autopilot Worker] Received START command.");
            state.isRunning = true;
            state.tickCount = 0;
            break;
        case 'stop':
            console.log("[Autopilot Worker] Received STOP command.");
            state.isRunning = false;
            break;
        case 'tick':
            tick((data as { time: number }).time);
            break;
        case 'setTempo':
            state.currentBpm = (data as { bpm: number }).bpm;
            break;
        case 'setHarmony':
            const harmonyData = data as { key: MusicKey, scale: MusicScale };
            state.currentKey = harmonyData.key;
            state.currentScale = harmonyData.scale;
            updateScaleFrequencies();
            break;
        case 'setDensity':
            state.density = (data as { density: number }).density;
            break;
    }
};

console.log("[Autopilot Worker] New worker instance initialized.");

    