
// --- TYPE DEFINITIONS (SHARED) ---
/**
 * @typedef {'bass' | 'accompaniment' | 'melody' | 'effects'} AutopilotPart
 * @typedef {'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'} MusicKey
 * @typedef {'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic'} MusicScale
 * @typedef {string} InstrumentType
 * @typedef {import('tone/build/esm/core/type/Units').Unit.Time} Time
 */

/**
 * @typedef {object} NoteEvent
 * @property {InstrumentType} type
 * @property {number} freq
 * @property {Time} dur
 * @property {number} vel
 */

/**
 * @typedef {object} WorkerResponse
 * @property {'playNote'} type
 * @property {NoteEvent} note
 * @property {number} time
 */


// --- WORKER STATE ---
const state = {
    tickCount: 0,
    currentKey: 'G',
    currentScale: 'Major',
    currentBpm: 70, // Slow, stately tempo
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true },
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    chordProgression: [0, 4, 1, 5], // I-V-ii-vi
    lastMelodyDegree: null,
};


// --- MUSIC THEORY HELPERS ---
const scaleIntervalMap = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};

function getNoteFrequency(key, octave, interval) {
    const A4 = 440;
    const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}

function getScaleFrequenciesForOctaves(key, scale, octaves) {
    const intervals = scaleIntervalMap[scale];
    if (!intervals) return [];
    let allFrequencies = [];
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            allFrequencies.push(getNoteFrequency(key, octave, interval));
        });
    });
    return allFrequencies.sort((a,b) => a - b);
}

function updateMusicContext() {
    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [3, 4]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [4, 5]),
    };

    if (state.currentScale.includes('Major')) {
        state.chordProgression = [0, 4, 1, 5]; // I-V-ii-vi - majestic progression
    } else {
        state.chordProgression = [0, 5, 3, 4]; // i-VI-iv-V
    }
    state.lastMelodyDegree = null;
}

function getFrequencyFromDegree(degree, part) {
    const freqs = state.scaleFrequencies[part];
    const scaleLength = (scaleIntervalMap[state.currentScale] || []).length;

    if (!freqs || freqs.length === 0 || !scaleLength) return null;
    
    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }
    return null;
}

function getChordTones(rootDegree) {
    const chordTones = [];
     if (!(state.currentScale in scaleIntervalMap)) return [];
    
    for (let i = 0; i < 3; i++) {
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}


// --- STYLE-SPECIFIC GENERATOR ---
function generateMusic(time) {
    const measure = Math.floor(state.tickCount / 16);
    const beatInMeasure = state.tickCount % 16;
    
    const chordIndex = measure % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass: Plays a heavy, half-note on the first beat of each measure.
    if (state.enabledParts.bass && beatInMeasure === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }

    // Accompaniment: Plays the full chord on the first and third beat of the measure.
    if (state.enabledParts.accompaniment && (beatInMeasure === 0 || beatInMeasure === 8)) {
        chordToneDegrees.forEach((degree, index) => {
             const freq = getFrequencyFromDegree(degree, 'accompaniment');
             if (freq) {
                /** @type {NoteEvent} */
                const note = { type: 'autopilot_accompaniment', freq, dur: '2n', vel: 0.6 - (index * 0.1) };
                self.postMessage({ type: 'playNote', note, time: time + index * 0.01 }); // Strum effect
             }
        });
    }

    // Melody: A simple, stately melody that follows the chord changes.
    if (state.enabledParts.melody && beatInMeasure === 0) {
        const melodyDegree = chordToneDegrees[0] + 7; // The root note, one octave up.
        const freq = getFrequencyFromDegree(melodyDegree, 'melody');
        if (freq) {
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_melody', freq, dur: '1n', vel: 0.7 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }
    
    state.tickCount++;
}

// --- WORKER EVENT HANDLER ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            state.tickCount = 0;
            updateMusicContext();
            break;
        case 'stop':
            state.tickCount = 0;
            break;
        case 'tick':
            generateMusic(data.time);
            break;
        case 'setHarmony':
            state.currentKey = data.key;
            state.currentScale = data.scale;
            updateMusicContext();
            break;
        case 'setTempo':
            state.currentBpm = data.bpm;
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
    }
};
