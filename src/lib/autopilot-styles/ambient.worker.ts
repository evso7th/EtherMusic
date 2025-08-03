// This file is a template and can be used as a base for new styles.
// However, it is not directly used by the AutopilotEngine anymore.
// The engine now dynamically loads workers from the /autopilot-styles/ directory.

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentType } from '../audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotPart = 'bass' | 'accompaniment' | 'melody' | 'effects';

type NoteEvent = {
    type: InstrumentType;
    freq: number;
    dur: Unit.Time;
    vel: number;
};

export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'tick', time: number }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setTempo', bpm: number }
    | { type: 'setParts', parts: Record<AutopilotPart, boolean> };

export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent, time: number };


// --- WORKER STATE (EXAMPLE) ---
let state = {
    tickCount: 0,
    currentKey: 'C' as MusicKey,
    currentScale: 'Major Pentatonic' as MusicScale,
    currentBpm: 120,
    scaleIntervals: [] as number[],
    chordProgression: [0, 4, 5, 3] as number[],
    lastMelodyDegree: null as number | null,
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true } as Record<AutopilotPart, boolean>,
    scaleFrequencies: {
        bass: [] as number[],
        accompaniment: [] as number[],
        melody: [] as number[],
    },
};

// --- WORKER LOGIC (EXAMPLE) ---

// This is just a placeholder. The actual logic is now in the .js files in /public/assets/workers/
function tick(time: number) {
    // Generate notes based on state and post them back
    // self.postMessage({ type: 'playNote', note: { ... }, time });
    state.tickCount++;
}

// --- WORKER EVENT HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            state.tickCount = 0;
            // Initialize or reset any logic needed for start
            break;
        case 'stop':
            state.tickCount = 0;
            // Clean up any state on stop
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setHarmony':
            // @ts-ignore
            state.currentKey = data.key;
            // @ts-ignore
            state.currentScale = data.scale;
            // Update internal music theory data
            break;
        case 'setTempo':
            // @ts-ignore
            state.currentBpm = data.bpm;
            break;
        case 'setParts':
            // @ts-ignore
            state.enabledParts = data.parts;
            break;
    }
};
