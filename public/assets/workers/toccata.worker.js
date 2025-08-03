
// --- TYPE DEFINITIONS (SHARED) ---
let state = {
    tickCount: 0,
    currentKey: 'C',
    currentScale: 'Minor',
    currentBpm: 120,
    scaleIntervals: [],
    chordProgression: [0, 3, 4, 0], // i-iv-V-i
    lastMelodyDegree: null,
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
        bass: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [3, 4]),
        melody: getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, [4, 5]),
    };
    state.chordProgression = state.currentScale.includes('Major') ? [0, 4, 5, 3] : [0, 3, 4, 0];
    state.lastMelodyDegree = null;
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
    return [0, 2, 4].map(i => rootDegree + i);
}

// --- STYLE-SPECIFIC GENERATOR: TOCCATA ---
function tick(time) {
    const subdivisions = 16;
    const measure = Math.floor(state.tickCount / subdivisions);
    const beat = state.tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass: Plays on the downbeat of each measure
    if (state.enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
    }

    // Accompaniment: Fast arpeggio
    if (state.enabledParts.accompaniment) {
        const arpPattern = [0, 1, 2, 1, 2, 1, 0, 1]; // 16th note arpeggio
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[arpPattern[patternIndex]];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
        }
    }

    // Melody: Less frequent, but dramatic leaps
    if (state.enabledParts.melody && beat % 16 === 0 && Math.random() > 0.3) {
        const leap = Math.random() > 0.5 ? 3 : -3; // leap up or down a 4th/5th
        let nextDegree = (state.lastMelodyDegree !== null) 
            ? state.lastMelodyDegree + leap
            : chordToneDegrees[0] + 7; // start high
        
        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.8 }, time });
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
            state.lastMelodyDegree = null;
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
            if (data.style === 'Toccata') {
                state.currentScale = 'Minor';
            }
            break;
    }
};
