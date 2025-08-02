
// --- TYPE DEFINITIONS ---
// These types are duplicated here because workers cannot import from the main app bundle.
// They are simplified and only contain what's necessary for the worker's logic.

// --- WORKER STATE ---
let timerId = null;
let tickCount = 0;
const subdivisions = 16; 

let currentKey = 'C';
let currentScale = 'Major Pentatonic';
let currentBpm = 120;
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
    
    for (let i = 0; i < 3; i++) {
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}

function generateArpeggio(beat, chordTonesDegrees, patternLength, syncopation) {
    if (chordTonesDegrees.length === 0) return null;
    const patterns = [
        [0, 1, 2, 1], // up & down
        [0, 2, 1, 2], // spread out
        [2, 1, 0, 1], // down & up
    ];
    const selectedPattern = patterns[Math.floor(beat / 4) % patterns.length];
    const patternIndex = (beat + syncopation) % patternLength;
    const degreeIndex = selectedPattern[patternIndex % selectedPattern.length];

    if (degreeIndex < chordTonesDegrees.length) {
        return chordTonesDegrees[degreeIndex];
    }
    return null;
}

// --- STYLE-SPECIFIC GENERATORS ---
function tick(time) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
        }
    }

    // Accompaniment
    if (enabledParts.accompaniment && (beat % 4 === 0)) {
        const degree = generateArpeggio(Math.floor(beat / 2), chordToneDegrees, 4, beat % 4);
        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '2n', vel: 0.5 }, time });
            }
        }
    }

    // Melody
    if (enabledParts.melody && beat % 8 === 1 && Math.random() > 0.4) {
        let nextDegree = null;
        
        if (lastMelodyDegree !== null) {
            if (Math.random() < 0.8) {
                const direction = Math.random() < 0.5 ? 1 : -1;
                nextDegree = lastMelodyDegree + direction;
            } else {
                nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
            }
        } else {
            nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        }

        if (nextDegree !== null) {
            const freq = getFrequencyFromDegree(nextDegree, 'melody');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1n', vel: 0.6 }, time });
                lastMelodyDegree = nextDegree;
            }
        }
    }

    // Effects
    if (enabledParts.effects && time >= nextEffectTime) {
        if (Math.random() < 0.15) {
             const randomRootDegree = chordProgression[Math.floor(Math.random() * chordProgression.length)];
             const freq = getFrequencyFromDegree(randomRootDegree, 'melody');
             if (freq) {
                 const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
                 const numNotes = Math.floor(Math.random() * 4) + 2;
                 for(let i=0; i < numNotes; i++){
                    const effectFreq = freq * Math.pow(1.05946, i*2 + (Math.random() - 0.5) * 4);
                    self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '4n', vel: Math.random() * 0.2 + 0.3 }, time: time + i * 0.15 });
                 }
             }
        }
        const randomDelay = Math.random() * 2000 + 1000;
        nextEffectTime = time + randomDelay / 1000;
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
        if (drift > intervalSeconds * 1000) {
            console.warn("Autopilot worker drift is high. Resetting expected time.");
            expected = now;
        }
        
        tick(expected / 1000);

        expected += intervalSeconds * 1000;
        timerId = setTimeout(loop, Math.max(0, intervalSeconds * 1000 - drift));
    }
    
    nextEffectTime = self.performance.now() / 1000 + 2;
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
