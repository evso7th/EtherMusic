// --- TYPE DEFINITIONS (must be self-contained) ---
// Note: We can't import types from the main project, so we redefine them here.

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

let currentKey = 'C';
let currentScale = 'Major Pentatonic';
let currentBpm = 90; // Slower default for ambient
let scaleIntervals = []; 
let chordProgression = [0, 4, 5, 3]; 

let lastMelodyDegree = null;

let enabledParts = {
    bass: true,
    accompaniment: true,
    melody: true,
    effects: true
};

let scaleFrequencies = {
    bass: [],
    accompaniment: [],
    melody: [],
};

const effectTypes = [
    'autopilot_effect_star', 'autopilot_effect_meteor', 'autopilot_effect_warp', 'autopilot_effect_hole',
    'autopilot_effect_pulsar', 'autopilot_effect_nebula', 'autopilot_effect_comet', 'autopilot_effect_wind', 'autopilot_effect_echoes'
];

let nextEffectTime = 0;


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
    scaleIntervals = scaleIntervalMap[currentScale] || [];
    
    scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(currentKey, currentScale, [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, [3, 4]),
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, [4, 5]),
    };

    if (currentScale.includes('Major')) {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
    lastMelodyDegree = null;
}

function getFrequencyFromDegree(degree, part) {
    const freqs = scaleFrequencies[part];
    const scaleLength = scaleIntervals.length;

    if (!freqs || freqs.length === 0 || !scaleLength) return null;
    
    // Ensure degree is an integer
    degree = Math.floor(degree);

    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }
    // Fallback if index is out of bounds (less common with the above logic, but safe)
    return freqs[Math.max(0, Math.min(freqs.length - 1, finalIndex))];
}

function getChordTones(rootDegree) {
    const chordTones = [];
    if (!scaleIntervals.length) return [];
    
    for (let i = 0; i < 3; i++) { // Triad
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}


// --- AMBIENT STYLE GENERATOR ---
function tick(time) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    // Update chord every 2 measures for a slower feel
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass: Slow, deep notes on the downbeat of every second measure
    if (enabledParts.bass && beat === 0 && measure % 2 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            /** @type {WorkerResponse} */
            const message = { type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.7 }, time };
            self.postMessage(message);
        }
    }

    // Accompaniment: Sparse, long arpeggios
    if (enabledParts.accompaniment && (beat % 8 === 0)) {
        const arpPattern = [0, 2, 1, 2]; // Slow arp pattern
        const patternIndex = Math.floor(beat / 8) % arpPattern.length;
        const degree = chordToneDegrees[arpPattern[patternIndex]];

        if (degree !== undefined) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                 /** @type {WorkerResponse} */
                const message = { type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '1n', vel: 0.4 }, time };
                self.postMessage(message);
            }
        }
    }

    // Melody: Very sparse, occasional long notes with a chance of not playing
    if (enabledParts.melody && beat === 4 && Math.random() > 0.7) {
        let nextDegree;
        
        if (lastMelodyDegree !== null) {
            // Tend to move by step
            if (Math.random() < 0.8) {
                const direction = Math.random() < 0.5 ? 1 : -1;
                nextDegree = lastMelodyDegree + direction;
            } else { // Or jump to a chord tone
                nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
            }
        } else {
            nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        }

        if (nextDegree !== null) {
            const freq = getFrequencyFromDegree(nextDegree, 'melody');
            if (freq) {
                /** @type {WorkerResponse} */
                const message = { type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1n.', vel: 0.5 }, time };
                self.postMessage(message);
                lastMelodyDegree = nextDegree;
            }
        }
    }

    // Effects: Rare, atmospheric sounds
    if (enabledParts.effects && time >= nextEffectTime) {
        if (Math.random() < 0.1) { // Low probability
             const randomRootDegree = chordProgression[Math.floor(Math.random() * chordProgression.length)];
             const freq = getFrequencyFromDegree(randomRootDegree, 'melody');
             if (freq) {
                 const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
                 const effectFreq = freq * (Math.random() > 0.5 ? 2 : 1);
                 /** @type {WorkerResponse} */
                 const message = { type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '2n', vel: Math.random() * 0.2 + 0.2 }, time };
                 self.postMessage(message);
             }
        }
        const randomDelay = Math.random() * 8000 + 5000; // 5 to 13 seconds
        nextEffectTime = time + randomDelay / 1000;
    }


    tickCount++;
}


// --- WORKER CONTROL ---

function start() {
    stop(); 
    updateMusicContext();
    tickCount = 0;
    const intervalSeconds = (60 / currentBpm) / (subdivisions / 4); // Interval for a 16th note

    let expected = self.performance.now() + intervalSeconds * 1000;

    const loop = () => {
        const now = self.performance.now();
        const drift = now - expected;
        if (drift > intervalSeconds * 1000) {
            console.warn("Autopilot worker drift is high. Resetting expected time.");
            // Don't schedule a tick, just reset the expected time for the next loop.
        } else {
            // Schedule the tick for the original 'expected' time.
            tick(expected / 1000); // Pass scheduled time in seconds
        }
        
        expected += intervalSeconds * 1000;
        timerId = setTimeout(loop, Math.max(0, intervalSeconds * 1000 - drift));
    }
    
    nextEffectTime = self.performance.now() / 1000 + 4; // Schedule first effect 4s from now
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
