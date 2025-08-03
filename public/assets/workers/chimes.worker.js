// --- Shared Music Theory and State ---
let state = {
    tickCount: 0,
    currentKey: 'C',
    currentScale: 'Major Pentatonic',
    scaleIntervals: [],
    chordProgression: [0, 4, 5, 3], // I-V-vi-IV for Major
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true },
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    // Chimes-specific state
    pattern1Index: 0,
    pattern2Index: 0,
};

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
    state.scaleIntervals = scaleIntervalMap[state.currentScale] || [];
    if (state.currentScale.includes('Major')) {
        state.chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        state.chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }

    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [2]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [3, 4, 5]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [4, 5, 6]),
    };
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

function getChordTones(rootDegree) {
    if (!state.scaleIntervals.length) return [];
    return [0, 2, 4].map(i => rootDegree + i);
}

// --- Chimes Style Logic ---

const pattern1 = [0, 2, 1, 3, 2, 4, 3, 5]; // Ascending/descending arpeggio
const pattern2 = [0, null, 1, null, 2, null, 1, null]; // Sparse, rhythmic pattern

function tick(time) {
    const measure = Math.floor(state.tickCount / 16);
    const beat = state.tickCount % 16;
    
    const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass: Very sparse, just on the downbeat of a chord change
    if (state.enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1n', vel: 0.6 }, time });
        }
    }

    // Accompaniment: Two interlocking "chime" patterns
    if (state.enabledParts.accompaniment) {
        // Pattern 1: Plays on every 8th note
        if (beat % 2 === 0) {
            const patternStep = pattern1[state.pattern1Index % pattern1.length];
            const degree = chordToneDegrees[patternStep % chordToneDegrees.length];
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.5 }, time });
            }
            state.pattern1Index++;
        }
        
        // Pattern 2: Plays a syncopated rhythm on 16th notes
        if (beat % 4 !== 0) { // Avoids the main beats to create syncopation
            const patternStep = pattern2[state.pattern2Index % pattern2.length];
            if (patternStep !== null) {
                const degree = chordToneDegrees[patternStep % chordToneDegrees.length] + state.scaleIntervals.length; // Play an octave higher
                const freq = getFrequencyFromDegree(degree, 'accompaniment');
                if (freq) {
                     self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '16n', vel: 0.7 }, time });
                }
            }
            state.pattern2Index++;
        }
    }

    state.tickCount++;
}


// --- Worker Event Handler ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            state.tickCount = 0;
            state.pattern1Index = 0;
            state.pattern2Index = 0;
            updateMusicContext();
            break;
        case 'stop':
            state.tickCount = 0;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setHarmony':
            state.currentKey = data.key;
            state.currentScale = data.scale;
            updateMusicContext();
            break;
        case 'setTempo':
            // Tempo changes are handled by the main thread's tick interval
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
    }
};
