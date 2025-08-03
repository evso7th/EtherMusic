
// --- TYPE DEFINITIONS (SHARED) ---
/** @typedef {'bass' | 'accompaniment' | 'melody' | 'effects'} AutopilotPart */
/** @typedef {string} MusicKey */
/** @typedef {string} MusicScale */
/** @typedef {string} InstrumentType */
/** @typedef {import('tone/build/esm/core/type/Units').Unit.Time} Time */
/** @typedef {{ type: InstrumentType; freq: number; dur: Time; vel: number; }} NoteEvent */
/** @typedef {{ type: 'playNote'; note: NoteEvent; time: number; }} WorkerResponse */

// --- WORKER STATE ---
const state = {
    tickCount: 0,
    currentKey: 'C',
    currentScale: 'Major Pentatonic', // Pentatonic scales sound great for chimes
    currentBpm: 80,
    enabledParts: { bass: false, accompaniment: true, melody: true, effects: false }, // No bass or FX
    scaleFrequencies: { bass: [], accompaniment: [], melody: [] },
};

// --- MUSIC THEORY HELPERS ---
const scaleIntervalMap = {
    'Major': [0, 2, 4, 5, 7, 9, 11], 'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9], 'Minor Pentatonic': [0, 3, 5, 7, 10],
};
function getNoteFrequency(key, octave, interval) {
    const A4 = 440; const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const midiNote = 12 * (octave + 1) + keyMap[key] + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}
function getScaleFrequenciesForOctaves(key, scale, octaves) {
    const intervals = scaleIntervalMap[scale]; if (!intervals) return [];
    let freqs = []; octaves.forEach(o => intervals.forEach(i => freqs.push(getNoteFrequency(key, o, i))));
    return freqs.sort((a,b) => a - b);
}
function updateMusicContext() {
    state.scaleFrequencies = {
        bass: [],
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [5, 6]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [6, 7]),
    };
}

// --- STYLE-SPECIFIC GENERATOR ---
function generateMusic(time) {
    // Accompaniment Chimes
    if (state.enabledParts.accompaniment && Math.random() < 0.1) { // Low probability for sparse feel
        const freqs = state.scaleFrequencies.accompaniment;
        if (freqs.length > 0) {
            const freq = freqs[Math.floor(Math.random() * freqs.length)];
            /** @type {NoteEvent} */
            // Use 'glass' instrument type for a chime-like sound
            const note = { type: 'autopilot_effect_star', freq, dur: '2n', vel: Math.random() * 0.4 + 0.3 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }

    // Melody Chimes (higher pitch)
    if (state.enabledParts.melody && Math.random() < 0.05) { // Even lower probability
        const freqs = state.scaleFrequencies.melody;
        if (freqs.length > 0) {
            const freq = freqs[Math.floor(Math.random() * freqs.length)];
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_effect_star', freq, dur: '1n', vel: Math.random() * 0.5 + 0.4 };
            self.postMessage({ type: 'playNote', note, time: time + 0.05 }); // Slight offset
        }
    }
    
    state.tickCount++;
}

// --- WORKER EVENT HANDLER ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start': state.tickCount = 0; updateMusicContext(); break;
        case 'stop': state.tickCount = 0; break;
        case 'tick': generateMusic(data.time); break;
        case 'setHarmony': state.currentKey = data.key; state.currentScale = data.scale; updateMusicContext(); break;
        case 'setTempo': state.currentBpm = data.bpm; break;
        case 'setParts': state.enabledParts = data.parts; break;
    }
};
