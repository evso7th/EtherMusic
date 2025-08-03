
// --- TYPE DEFINITIONS (SHARED) ---
// Note: These types are for JSDoc and development aid, not enforced in the worker.

/**
 * @typedef {'bass' | 'accompaniment' | 'melody' | 'effects'} AutopilotPart
 * @typedef {'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'} MusicKey
 * @typedef {'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic'} MusicScale
 * @typedef {'autopilot_melody' | 'autopilot_bass' | 'autopilot_accompaniment' | 'autopilot_effect_star' | 'autopilot_effect_meteor'} InstrumentType
 * @typedef {string | number} ToneTime
 */

/**
 * @typedef {object} NoteEvent
 * @property {InstrumentType} type
 * @property {number} freq
 * @property {ToneTime} dur
 * @property {number} vel
 */

/**
 * @typedef {object} WorkerEvent
 * @property {'start' | 'stop' | 'tick' | 'setHarmony' | 'setTempo' | 'setParts'} type
 * @property {number} [time] - for 'tick'
 * @property {MusicKey} [key] - for 'setHarmony'
 * @property {MusicScale} [scale] - for 'setHarmony'
 * @property {number[]} [bassOctaves]
 * @property {number[]} [melodyOctaves]
 * @property {number[]} [accompanimentOctaves]
 * @property {number} [bpm] - for 'setTempo'
 * @property {Record<AutopilotPart, boolean>} [parts] - for 'setParts'
 */

/**
 * @typedef {object} WorkerResponse
 * @property {'playNote'} type
 * @property {NoteEvent} note
 * @property {number} time
 */


// --- WORKER STATE ---
let state = {
    tickCount: 0,
    currentKey: 'D',
    currentScale: 'Minor',
    scaleIntervals: [],
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true },
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    // Toccata Specific State
    melodyPhrase: [11, 10, 11, 9, 11, 8, 11, 7, 11, 10, 8, 7, 6, 5, 6, 7], // Degrees from D minor scale starting at D5
    melodyIndex: 0,
    bassPhrase: [0, -1, 0, -2, 0, -3, 0, -4, 0, 7, 6, 5, 4, 3, 2, 0], // Bass degrees relative to D2
    bassIndex: 0,
};

// --- MUSIC THEORY HELPERS ---
const scaleIntervalMap = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};

const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

function getNoteFrequency(key, octave, interval) {
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * 440;
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
    return allFrequencies.sort((a, b) => a - b);
}

function getFrequencyFromDegree(degree, part) {
    const freqs = state.scaleFrequencies[part];
    const scaleLength = state.scaleIntervals.length;
    if (!freqs || freqs.length === 0 || !scaleLength) return null;

    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    return (finalIndex >= 0 && finalIndex < freqs.length) ? freqs[finalIndex] : null;
}

function updateMusicContext(data) {
    state.currentKey = data.key || state.currentKey;
    state.currentScale = data.scale || state.currentScale;
    state.scaleIntervals = scaleIntervalMap[state.currentScale] || [];
    
    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, data.bassOctaves || [2, 3]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, data.accompanimentOctaves || [3, 4]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, data.melodyOctaves || [4, 5]),
    };
}

// --- GENERATION LOGIC ---
function tick(time) {
    const subdivision = state.tickCount % 16;

    // MELODY
    if (state.enabledParts.melody && subdivision % 2 === 0) { // Play every 8th note
        const degree = state.melodyPhrase[state.melodyIndex];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '16n', vel: 0.9 }, time });
        }
        state.melodyIndex = (state.melodyIndex + 1) % state.melodyPhrase.length;
    }

    // BASS
    if (state.enabledParts.bass && subdivision % 4 === 0) { // Play every 4th note
        const degree = state.bassPhrase[state.bassIndex];
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 0.8 }, time });
        }
         state.bassIndex = (state.bassIndex + 1) % state.bassPhrase.length;
    }

    // EFFECTS in place of accompaniment
    if (state.enabledParts.effects && subdivision === 1 && Math.random() < 0.25) {
        const rootNoteDegree = state.bassPhrase[state.bassIndex];
        const freq = getFrequencyFromDegree(rootNoteDegree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_effect_star', freq: freq * 2, dur: '2n', vel: 0.4 }, time });
        }
    }

    state.tickCount++;
}


// --- WORKER EVENT HANDLER ---
self.onmessage = function (event) {
    /** @type {WorkerEvent} */
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            state.tickCount = 0;
            state.melodyIndex = 0;
            state.bassIndex = 0;
            break;
        case 'stop':
            state.tickCount = 0;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setHarmony':
            updateMusicContext(data);
            break;
        case 'setParts':
            if (data.parts) state.enabledParts = data.parts;
            break;
    }
};
