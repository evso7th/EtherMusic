
// @/lib/autopilot-worker.ts
// This is the new, clean entry point for your custom autopilot logic.
// All the old styles (Ambient, Toccata, etc.) have been removed.

import type { MusicKey, MusicScale, Instrument } from '@/app/page';

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
    | { type: 'setTempo', bpm: number };

// Events sent back to the main thread
export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent }
    | { type: 'updateNote', note: NoteUpdateEvent }
    | { type: 'playNotesBatch', notes: NoteEvent[] };


// --- WORKER STATE ---
// This is where you'll manage the state of your new autopilot.
let state = {
    isRunning: false,
    tickCount: 0,
    currentKey: 'G' as MusicKey,
    currentScale: 'Major' as MusicScale,
    currentBpm: 90,
    // Add any other state variables your new autopilot needs.
};


// --- YOUR NEW AUTOPILOT LOGIC ---

/**
 * This function is called every 16th note.
 * @param time The precise time of the tick from Tone.Transport.
 */
function tick(time: number) {
    if (!state.isRunning) return;

    const notesToPlay: NoteEvent[] = [];

    // =================================================================
    // TODO: IMPLEMENT YOUR NEW AUTOPILOT LOGIC HERE
    //
    // Example: Play a random melody note every 4 ticks (every quarter note)
    //
    // if (state.tickCount % 4 === 0) {
    //     const melodyFreq = 440; // Replace with your scale logic
    //     notesToPlay.push({
    //         part: 'melody',
    //         freq: melodyFreq,
    //         dur: '8n',
    //         vel: 0.8,
    //         time: time
    //     });
    // }
    // =================================================================


    // Send any generated notes back to the main thread in a batch
    if (notesToPlay.length > 0) {
        self.postMessage({ type: 'playNotesBatch', notes: notesToPlay });
    }

    state.tickCount++;
}


// --- MESSAGE HANDLER (Boilerplate) ---
// This handles communication with the main thread.
// You shouldn't need to change this much.
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            console.log("[Autopilot Worker] Received START command.");
            state.isRunning = true;
            state.tickCount = 0;
            // Reset any of your custom state here
            break;
        case 'stop':
            console.log("[Autopilot Worker] Received STOP command.");
            state.isRunning = false;
            break;
        case 'tick':
            // This is the main heartbeat of the autopilot
            tick(data.time);
            break;
        case 'setTempo':
            console.log(`[Autopilot Worker] Tempo set to: ${data.bpm}`);
            // @ts-ignore
            state.currentBpm = data.bpm;
            break;
        case 'setHarmony':
             console.log(`[Autopilot Worker] Harmony set to: ${data.key} ${data.scale}`);
            // @ts-ignore
            state.currentKey = data.key;
            // @ts-ignore
            state.currentScale = data.scale;
            // You might want to recalculate your scale frequencies here
            break;
    }
};

console.log("[Autopilot Worker] New worker instance initialized.");
