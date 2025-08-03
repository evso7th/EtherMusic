// --- Shared Autopilot Logic ---
let state = {
    running: false,
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
    chordProgression: [0, 4, 5, 3],
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

function getFrequencyFromDegree(degree, part) {
    const freqs = state.scaleFrequencies[part];
    const scaleLength = scaleIntervalMap[state.currentScale].length;
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
    const scaleLength = scaleIntervalMap[state.currentScale].length;
    if (!scaleLength) return [];
    
    for (let i = 0; i < 3; i++) {
        chordTones.push(rootDegree + i * 2);
    }
    return chordTones;
}

function updateMusicContext(data) {
    state.currentKey = data.key;
    state.currentScale = data.scale;
    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(data.key, data.scale, data.bassOctaves || [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(data.key, data.scale, data.accompanimentOctaves || [3, 4]),
        melody: getScaleFrequenciesForOctaves(data.key, data.scale, data.melodyOctaves || [4, 5]),
    };

    if (state.currentScale.includes('Major')) {
        state.chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        state.chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
}

// --- Style-Specific Logic for "Sequence" ---

let evolutionLevel = 0; // 0 to 3
let lastMelodyNoteTime = 0;

function tick(time) {
    if (!state.running) return;
    
    const ticksPerMeasure = 16;
    const measure = Math.floor(state.tickCount / ticksPerMeasure);
    const beat = state.tickCount % ticksPerMeasure;

    // Evolve the complexity every 8 measures
    if (state.tickCount > 0 && state.tickCount % (ticksPerMeasure * 8) === 0) {
        evolutionLevel = (evolutionLevel + 1) % 4;
    }

    const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordTones = getChordTones(rootDegree);

    // --- Part Generation ---

    // Bass: Simple, grounding pulse
    if (state.enabledParts.bass && evolutionLevel >= 0 && (beat % 8 === 0)) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.7 }, time });
        }
    }

    // Accompaniment: The evolving sequence
    if (state.enabledParts.accompaniment && evolutionLevel >= 1 && (beat % 4 === 0)) {
        const arpPattern = evolutionLevel < 2 ? [0, 2] : [0, 1, 2, 1];
        const patternIndex = (beat / 4) % arpPattern.length;
        const degree = chordTones[arpPattern[patternIndex]];

        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.4 }, time });
        }
    }
    
    // Melody: Appears at higher evolution levels
    const canPlayMelody = (time - lastMelodyNoteTime > (60 / state.currentBpm * 4)); // At least 4 beats apart
    if (state.enabledParts.melody && evolutionLevel >= 2 && canPlayMelody && Math.random() < 0.1) {
        const degree = chordTones[Math.floor(Math.random() * chordTones.length)] + 7; // Play an octave higher
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1n', vel: 0.6 }, time });
            lastMelodyNoteTime = time;
        }
    }
    
    state.tickCount++;
}


// --- Worker Event Handler ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            state.running = true;
            state.tickCount = 0;
            evolutionLevel = 0;
            lastMelodyNoteTime = 0;
            break;
        case 'stop':
            state.running = false;
            break;
        case 'tick':
            if (state.running) tick(data.time);
            break;
        case 'setHarmony':
            updateMusicContext(data);
            break;
        case 'setTempo':
            state.currentBpm = data.bpm;
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
    }
};
