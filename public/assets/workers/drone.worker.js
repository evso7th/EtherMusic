
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
    currentScale: 'Minor',
    currentBpm: 60, // Very slow
    enabledParts: { bass: true, accompaniment: true, melody: false, effects: false }, // Focus on bass drone
    scaleFrequencies: { bass: [], accompaniment: [], melody: [] },
    chordProgression: [0, 3, 5, 6], // i-iv-VI-VII
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
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [2, 3]),
        melody: [],
    };
    state.chordProgression = state.currentScale.includes('Major') ? [0, 4, 5, 3] : [0, 3, 5, 6];
}
function getFrequencyFromDegree(degree, part) {
    const freqs = state.scaleFrequencies[part]; const scaleLen = (scaleIntervalMap[state.currentScale] || []).length;
    if (!freqs || !freqs.length || !scaleLen) return null;
    const noteIdx = (degree % scaleLen + scaleLen) % scaleLen; const octOffset = Math.floor(degree / scaleLen);
    const finalIdx = noteIdx + (octOffset * scaleLen);
    return (finalIdx >= 0 && finalIdx < freqs.length) ? freqs[finalIdx] : null;
}
function getChordTones(rootDegree) {
    const tones = []; if (!(state.currentScale in scaleIntervalMap)) return [];
    for (let i = 0; i < 2; i++) tones.push(rootDegree + i * 4); // Root and fifth
    return tones;
}


// --- STYLE-SPECIFIC GENERATOR ---
function generateMusic(time) {
    const measure = Math.floor(state.tickCount / 16);
    const beatInMeasure = state.tickCount % 16;
    
    // Only trigger on the first beat of every 4th measure (very slow change)
    if (state.tickCount % 64 === 0) {
        const chordIndex = Math.floor(measure / 4) % state.chordProgression.length;
        const rootDegree = state.chordProgression[chordIndex];
        const chordTones = getChordTones(rootDegree); // Will be root and fifth

        // Bass Drone (Root note)
        if (state.enabledParts.bass) {
            const freq = getFrequencyFromDegree(chordTones[0], 'bass');
            if (freq) {
                /** @type {NoteEvent} */
                const note = { type: 'autopilot_bass', freq, dur: '4m', vel: 0.8 }; // Lasts 4 measures
                self.postMessage({ type: 'playNote', note, time });
            }
        }
        
        // Accompaniment Drone (Fifth note)
        if (state.enabledParts.accompaniment) {
            const freq = getFrequencyFromDegree(chordTones[1], 'accompaniment');
            if (freq) {
                 /** @type {NoteEvent} */
                const note = { type: 'autopilot_accompaniment', freq, dur: '4m', vel: 0.6 };
                self.postMessage({ type: 'playNote', note, time: time + 0.05 });
            }
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
