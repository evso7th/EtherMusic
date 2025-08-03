// --- TYPE DEFINITIONS (must be self-contained) ---
/**
 * @typedef {'bass' | 'accompaniment' | 'melody' | 'effects'} AutopilotPart
 * @typedef {'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'} MusicKey
 * @typedef {'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic'} MusicScale
 * @typedef {string} InstrumentType - e.g., 'autopilot_bass', 'autopilot_melody'
 * @typedef {number | string} ToneTime - e.g., '4n', 0.5
 */

/**
 * @typedef {object} NoteEvent
 * @property {InstrumentType} type
 * @property {number} freq
 * @property {ToneTime} dur
 * @property {number} vel
 */

/**
 * @typedef {object} WorkerResponse
 * @property {'playNote'} type
 * @property {NoteEvent} note
 * @property {number} time - The precise time from performance.now() to play the note
 */


// --- WORKER STATE ---
let timerId = null;
let tickCount = 0;
const subdivisions = 16; 

let currentKey = 'G';
let currentScale = 'Major'; // Promenade is typically major key
let currentBpm = 70; // Slow, stately tempo
let scaleIntervals = []; 
let chordProgression = [0, 3, 4, 0]; // I-IV-V-I - a classic, strong progression

let enabledParts = {
    bass: true,
    accompaniment: true,
    melody: true,
    effects: false
};

let scaleFrequencies = {
    bass: [],
    accompaniment: [],
    melody: [],
};

// --- MUSIC THEORY HELPERS (same as other workers) ---

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
    scaleIntervals = scaleIntervalMap[currentScale] || [];
    
    scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(currentKey, currentScale, [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, [3, 4]),
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, [4, 5]),
    };
    
    chordProgression = [0, 3, 4, 0];
}

function getFrequencyFromDegree(degree, part) {
    const freqs = scaleFrequencies[part];
    const scaleLength = scaleIntervals.length;

    if (!freqs || freqs.length === 0 || !scaleLength) return null;
    
    degree = Math.floor(degree);

    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }
    return freqs[Math.max(0, Math.min(freqs.length - 1, finalIndex))];
}

function getChordTones(rootDegree) {
    const chordTones = [];
    if (!scaleIntervals.length) return [];
    
    // Full triad
    for (let i = 0; i < 3; i++) {
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}


// --- PROMENADE STYLE GENERATOR ---
function tick(time) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Stately, walking rhythm with chords. Play on 1 and 3.
    const isPlayingBeat = (beat === 0 || beat === 8);
    
    if (isPlayingBeat) {
        // Bass: Root note of the chord, strong and clear.
        if (enabledParts.bass) {
            const freq = getFrequencyFromDegree(rootDegree, 'bass');
            if (freq) {
                /** @type {WorkerResponse} */
                const message = { type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 0.9 }, time };
                self.postMessage(message);
            }
        }
    
        // Accompaniment and Melody play the full chord together for a powerful, majestic sound.
        if (enabledParts.accompaniment) {
            chordToneDegrees.forEach((degree, index) => {
                const part = (index < 2) ? 'accompaniment' : 'melody';
                const freq = getFrequencyFromDegree(degree, part);
                if (freq) {
                    /** @type {WorkerResponse} */
                    const message = { type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.7 - (index * 0.1) }, time };
                     self.postMessage(message);
                }
            });
        }
    }
    
    tickCount++;
}


// --- WORKER CONTROL ---
function start() {
    stop(); 
    updateMusicContext();
    tickCount = 0;
    const intervalSeconds = (60 / currentBpm) / (subdivisions / 4);

    let expected = self.performance.now() + intervalSeconds * 1000;

    const loop = () => {
        const now = self.performance.now();
        const drift = now - expected;
        if (drift > intervalSeconds * 1000) {
            // High drift, skip
        } else {
            tick(expected / 1000); 
        }
        
        expected += intervalSeconds * 1000;
        timerId = setTimeout(loop, Math.max(0, intervalSeconds * 1000 - drift));
    }
    
    timerId = setTimeout(loop, intervalSeconds * 1000);
}

function stop() {
    if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
    }
}

self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            start();
            break;
        case 'stop':
            stop();
            break;
        case 'setHarmony':
            currentKey = data.key;
            currentScale = data.scale;
            updateMusicContext();
            break;
        case 'setTempo':
            currentBpm = data.bpm;
            if (timerId !== null) { 
                start();
            }
            break;
        case 'setParts':
            enabledParts = data.parts;
            break;
    }
};
