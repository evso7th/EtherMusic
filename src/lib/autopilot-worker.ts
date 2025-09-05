// src/lib/autopilot-worker.ts
import type { MusicKey, MusicScale } from '@/app/page';

// --- TYPE DEFINITIONS (Keep these consistent with page.tsx) ---

export type AutopilotPart = 'melody' | 'accompaniment' | 'bass' | 'effects';

export type NoteEvent = {
    id?: number;
    part: AutopilotPart;
    freq: number;
    dur: string; // Use string notation like '4n', '8t', '1m'
    vel: number;
    time: number; // Absolute time for playback
};

export type NoteUpdateEvent = {
    id: number;
    part: AutopilotPart;
    freq: number;
    rampTime: string;
};

// Events received from the main thread
export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'tick', time: number }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setTempo', bpm: number }
    | { type: 'setDensity', density: number };

// Events sent back to the main thread
export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent }
    | { type: 'updateNote', note: NoteUpdateEvent }
    | { type: 'playNotesBatch', notes: NoteEvent[] };


// --- UTILITIES ---
const C4 = 261.63;
const ALL_NOTES: Record<MusicKey, number> = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
};

const SCALES: Record<MusicScale, number[]> = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10]
};

function getScaleFrequencies(baseFreq: number, scale: number[], octaves: number[]): number[] {
    const freqs: number[] = [];
    octaves.forEach(octave => {
        scale.forEach(interval => {
            freqs.push(baseFreq * Math.pow(2, octave + interval / 12));
        });
    });
    return freqs;
}

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
    const baseNote = ALL_NOTES[state.currentKey];
    const baseFreq = C4 * Math.pow(2, (baseNote - 9) / 12);
    const scale = SCALES[state.currentScale];

    state.scaleFrequencies.melody = getScaleFrequencies(baseFreq, scale, [0, 1]);
    state.scaleFrequencies.accompaniment = getScaleFrequencies(baseFreq, scale, [-1, 0, 1]);
    state.scaleFrequencies.bass = getScaleFrequencies(baseFreq, scale, [-2, -1]);
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
        self.postMessage({ type: 'playNotesBatch', notes: notesToPlay });
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
