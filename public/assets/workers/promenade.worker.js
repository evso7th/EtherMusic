
// --- TYPE DEFINITIONS (SHARED) ---
let state = {
    tickCount: 0,
    currentKey: 'C',
    currentScale: 'Major',
    currentBpm: 120,
    scaleIntervals: [],
    chordProgression: [0, 4, 5, 3], // I-V-vi-IV
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: false },
    scaleFrequencies: { bass: [], accompaniment: [], melody: [] },
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
    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [1]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [2, 3]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [4]),
    };
    state.chordProgression = state.currentScale.includes('Major') ? [0, 4, 5, 3] : [0, 5, 3, 6];
}

function getFrequencyFromDegree(degree, part) {
    const freqs = state.scaleFrequencies[part];
    const scaleLength = state.scaleIntervals.length;
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
    if (!state.scaleIntervals.length) return [];
    // Returns a full chord: root, third, fifth
    return [0, 2, 4].map(i => rootDegree + i);
}

// --- STYLE-SPECIFIC GENERATOR: PROMENADE ---
function tick(time) {
    const subdivisions = 16;
    const measure = Math.floor(state.tickCount / subdivisions);
    const beat = state.tickCount % subdivisions;
    
    // Change chord every 2 beats (8 subdivisions)
    const chordIndex = Math.floor(beat / 8) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Play a full, stately chord on beats 1 and 3
    if (state.enabledParts.accompaniment && (beat === 0 || beat === 8)) {
        // Bass part
        const bassFreq = getFrequencyFromDegree(rootDegree, 'bass');
        if (bassFreq) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq: bassFreq, dur: '4n', vel: 0.9 }, time });
        }

        // Accompaniment chord tones
        const accomFreq1 = getFrequencyFromDegree(chordToneDegrees[1], 'accompaniment');
        if (accomFreq1) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq: accomFreq1, dur: '4n', vel: 0.7 }, time });
        }
        const accomFreq2 = getFrequencyFromDegree(chordToneDegrees[2], 'accompaniment');
        if (accomFreq2) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq: accomFreq2, dur: '4n', vel: 0.7 }, time });
        }
    }
     // Simple melody on top
    if (state.enabledParts.melody && (beat === 4 || beat === 12)) {
        const melodyDegree = chordToneDegrees[0] + state.scaleIntervals.length; // An octave higher
        const freq = getFrequencyFromDegree(melodyDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '8n', vel: 0.8 }, time });
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
            tick(data.time);
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
        case 'setStyle':
             if (data.style === 'Promenade') {
                state.currentScale = 'Major';
            }
            break;
    }
};
