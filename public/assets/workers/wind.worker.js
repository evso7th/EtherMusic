
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
    currentScale: 'Major Pentatonic',
    currentBpm: 100,
    enabledParts: { bass: false, accompaniment: true, melody: true, effects: true }, // Bass off by default
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
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [1]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [5, 6]), // High
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [6, 7]), // Very high
    };
}

// --- STYLE-SPECIFIC GENERATOR ---
function generateMusic(time) {
    // Accompaniment: Very sparse, high-pitched "gusts"
    if (state.enabledParts.accompaniment && Math.random() < 0.05) {
        const freqs = state.scaleFrequencies.accompaniment;
        if (freqs.length > 0) {
            const freq = freqs[Math.floor(Math.random() * freqs.length)];
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_accompaniment', freq, dur: '1n', vel: Math.random() * 0.3 + 0.2 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }

    // Melody: Even sparser, very high "whistles"
    if (state.enabledParts.melody && Math.random() < 0.02) {
        const freqs = state.scaleFrequencies.melody;
        if (freqs.length > 0) {
            const freq = freqs[Math.floor(Math.random() * freqs.length)];
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_melody', freq, dur: '2n', vel: Math.random() * 0.4 + 0.3 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }
    
    // Effects: Use the dedicated wind effect
    if (state.enabledParts.effects && Math.random() < 0.01) {
        const freqs = state.scaleFrequencies.accompaniment;
        if (freqs.length > 0) {
            const freq = freqs[Math.floor(Math.random() * freqs.length)];
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_effect_wind', freq, dur: '1m', vel: 0.6 };
            self.postMessage({ type: 'playNote', note, time });
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
