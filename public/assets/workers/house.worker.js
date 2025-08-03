
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
    currentBpm: 120,
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: false },
    scaleFrequencies: { bass: [], accompaniment: [], melody: [] },
    chordProgression: [0, 5, 3, 4], // i-VI-iv-V
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
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [3, 4]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [4, 5]),
    };
    state.chordProgression = state.currentScale.includes('Major') ? [0, 4, 5, 3] : [0, 5, 3, 4];
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
    const chordIndex = measure % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordTones = getChordTones(rootDegree);

    // Bass: Classic off-beat house bassline
    if (state.enabledParts.bass && (beatInMeasure % 4 === 2)) { // every off-beat
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_bass', freq, dur: '8n', vel: 0.9 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }

    // Accompaniment: Plays a sustained chord pad
    if (state.enabledParts.accompaniment && beatInMeasure === 0) {
        chordTones.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                /** @type {NoteEvent} */
                const note = { type: 'autopilot_accompaniment', freq, dur: '1m', vel: 0.5 - (index * 0.1) };
                self.postMessage({ type: 'playNote', note, time: time + index * 0.01 });
            }
        });
    }
    
    // Fake Kick Drum using a low-frequency synth
    if (state.enabledParts.bass && beatInMeasure % 4 === 0) {
        const kickFreq = getNoteFrequency('C', 1, 0); // Low C
        /** @type {NoteEvent} */
        const note = { type: 'autopilot_effect_pulsar', freq: kickFreq, dur: '16n', vel: 1.0 };
        self.postMessage({ type: 'playNote', note, time });
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
