
// --- TYPE DEFINITIONS (SHARED) ---
// These types should ideally be in a shared file, but for worker simplicity, they are redefined here.
// Note: Actual InstrumentType and AutopilotStyle enums are in the main app.
// The worker uses them as strings.

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
    currentKey: 'C',
    currentScale: 'Major Pentatonic',
    currentBpm: 90,
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true },
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    chordProgression: [0, 4, 5, 3], // I-V-vi-IV for Major
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
    const intervals = scaleIntervalMap[state.currentScale] || [];
    
    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [3, 4]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [4, 5]),
    };

    if (state.currentScale.includes('Major')) {
        state.chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        state.chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
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
    const scaleLength = (scaleIntervalMap[state.currentScale] || []).length;
    if (!scaleLength) return [];
    
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
    
    const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass: Plays a long note at the beginning of every other measure.
    if (state.enabledParts.bass && state.tickCount % 32 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_bass', freq, dur: '1m', vel: 0.7 };
            self.postMessage({ type: 'playNote', note, time });
        }
    }

    // Accompaniment: Plays a sparse, arpeggiated chord tone every 4 beats (quarter note).
    if (state.enabledParts.accompaniment && beatInMeasure % 4 === 0) {
        const arpPattern = [0, 1, 2, 1];
        const patternIndex = Math.floor(beatInMeasure / 4) % arpPattern.length;
        const degree = chordToneDegrees[patternIndex];

        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                /** @type {NoteEvent} */
                const note = { type: 'autopilot_accompaniment', freq, dur: '2n', vel: 0.5 };
                self.postMessage({ type: 'playNote', note, time });
            }
        }
    }

    // Melody: Plays a single, wandering note with a low probability, creating a sparse melody.
    if (state.enabledParts.melody && beatInMeasure === 0 && Math.random() < 0.3) {
        let nextDegree;
        if (state.lastMelodyDegree !== null && Math.random() < 0.7) {
            const direction = Math.random() < 0.5 ? 1 : -1;
            nextDegree = state.lastMelodyDegree + direction;
        } else {
            nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        }

        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            /** @type {NoteEvent} */
            const note = { type: 'autopilot_melody', freq, dur: '1n', vel: 0.6 };
            self.postMessage({ type: 'playNote', note, time });
            state.lastMelodyDegree = nextDegree;
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
