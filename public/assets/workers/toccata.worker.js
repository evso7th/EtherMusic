
// --- TYPE DEFINITIONS ---
// These types are duplicated here because workers cannot import from the main app bundle.
// They are simplified and only contain what's necessary for the worker's logic.

// --- WORKER STATE ---
let timerId = null;
let tickCount = 0;
const subdivisions = 16; 

let currentKey = 'C';
let currentScale = 'Minor'; // Toccata often sounds better in minor keys
let currentBpm = 120;
let scaleIntervals = [];
let chordProgression = [0, 3, 4, 0]; // i-iv-V-i - classic dramatic progression

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
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, [2, 3]),
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, [3, 4]),
    };

     if (currentScale.includes('Major')) {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 3, 4, 0]; // i-iv-V-i
    }
}

function getFrequencyFromDegree(degree, part) {
    const freqs = scaleFrequencies[part];
    const scaleLength = scaleIntervals.length;

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
    if (!scaleIntervals.length) return [];
    
    for (let i = 0; i < 4; i++) { // Use 4 notes for richer arpeggios
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}

// --- STYLE-SPECIFIC GENERATORS ---
function tick(time) {
    const measure = Math.floor(tickCount / subdivisions);
    const beatInMeasure = tickCount % subdivisions; // 0-15
    
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass: Plays on the downbeat of each measure, holding the root note
    if (enabledParts.bass && beatInMeasure === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
    }

    // Accompaniment: Fast, relentless 16th note arpeggios
    if (enabledParts.accompaniment) {
        const arpPattern = [0, 1, 2, 3, 2, 1, 0, 1]; // Classic Toccata-style pattern
        const degreeIndex = arpPattern[beatInMeasure % arpPattern.length];
        const degree = chordToneDegrees[degreeIndex % chordToneDegrees.length];
        
        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.5 }, time });
            }
        }
    }

    // Melody: Plays a slower, more deliberate melody line on top
    if (enabledParts.melody && beatInMeasure % 4 === 0) { // Play on each quarter note
        const melodyPattern = [0, 2, 1, 3];
        const degreeIndex = melodyPattern[Math.floor(beatInMeasure / 4) % melodyPattern.length];
        const degree = chordToneDegrees[degreeIndex];
        
        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'melody');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '4n', vel: 0.75 }, time });
            }
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

    let expected = self.performance.now();

    const loop = () => {
        const now = self.performance.now();
        const drift = now - expected;
        
        tick(expected / 1000);

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
