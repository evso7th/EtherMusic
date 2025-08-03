
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
    currentBpm: 110,
    enabledParts: { bass: true, accompaniment: true, melody: false, effects: false }, // Focus on bass and arp
    scaleFrequencies: { bass: [], accompaniment: [], melody: [] },
    chordProgression: [0, 5, 3, 6], // i-VI-IV-VII
    arpPattern: [0, 1, 2, 1],
    arpDirection: 1,
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
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [3, 4, 5]),
        melody: [],
    };
    state.chordProgression = state.currentScale.includes('Major') ? [0, 4, 5, 3] : [0, 5, 3, 6];
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
    for (let i = 0; i < 3; i++) tones.push(rootDegree + i * 2);
    return tones;
}

// --- STYLE-SPECIFIC GENERATOR ---
function generateMusic(time) {
    const measure = Math.floor(state.tickCount / 16);
    const beatInMeasure = state.tickCount % 16;
    const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    
    // Bass: Simple, on the downbeat of the chord change
    if (state.enabledParts.bass && state.tickCount % 32 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_bass', freq, dur: '2n', vel: 1.0 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }

    // Accompaniment: The main arpeggiator
    if (state.enabledParts.accompaniment) {
        const chordTones = getChordTones(rootDegree);
        
        // Change arpeggio pattern every 4 measures
        if (measure % 4 === 0 && beatInMeasure === 0) {
            if (Math.random() < 0.5) state.arpPattern = [0, 1, 2, 1]; // Up/Down
            else state.arpPattern = [0, 2, 1, 3]; // Random
        }

        const patternIndex = beatInMeasure % state.arpPattern.length;
        const degreeOffset = state.arpPattern[patternIndex];
        const degree = chordTones[degreeOffset % chordTones.length];
        
        if (degree !== undefined) {
             const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                /** @type {NoteEvent} */
                const note = { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.7 };
                self.postMessage({ type: 'playNote', note, time });
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
