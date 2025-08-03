
// --- Tone.js Simplified ---
// A minimal set of functions from Tone.js to enable standalone worker operation.

const A4 = 440;
const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

function getNoteFrequency(key, octave, interval) {
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}

const scaleIntervalMap = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};

// --- WORKER STATE ---
let state = {
    isStarted: false,
    tickCount: 0,
    currentKey: 'C',
    currentScale: 'Major Pentatonic',
    currentBpm: 90,
    bassOctaves: [2, 3],
    accompanimentOctaves: [3, 4],
    melodyOctaves: [4, 5],
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true },
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    chordProgression: [0, 4, 5, 3], // I-V-vi-IV for Major
    lastMelodyDegree: null,
    nextEffectTime: 0,
    effectTypes: [
        'autopilot_effect_star', 'autopilot_effect_meteor', 'autopilot_effect_warp', 'autopilot_effect_hole',
        'autopilot_effect_pulsar', 'autopilot_effect_nebula', 'autopilot_effect_comet', 'autopilot_effect_wind', 'autopilot_effect_echoes'
    ]
};

// --- MUSIC THEORY & UTILS ---

function updateHarmony() {
    const { currentKey, currentScale, bassOctaves, accompanimentOctaves, melodyOctaves } = state;
    const intervals = scaleIntervalMap[currentScale] || [];
    
    const getOctaveFreqs = (octaves) => {
        let allFreqs = [];
        octaves.forEach(octave => {
            intervals.forEach(interval => {
                allFreqs.push(getNoteFrequency(currentKey, octave, interval));
            });
        });
        return allFreqs.sort((a, b) => a - b);
    };

    state.scaleFrequencies.bass = getOctaveFreqs(bassOctaves);
    state.scaleFrequencies.accompaniment = getOctaveFreqs(accompanimentOctaves);
    state.scaleFrequencies.melody = getOctaveFreqs(melodyOctaves);

    if (currentScale.includes('Major')) {
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

    return (finalIndex >= 0 && finalIndex < freqs.length) ? freqs[finalIndex] : null;
}

function getChordTones(rootDegree) {
    return [rootDegree, rootDegree + 2, rootDegree + 4]; // Root, 3rd, 5th
}

// --- TRANCE STYLE GENERATOR ---

function generateTrance(time) {
    const measure = Math.floor(state.tickCount / 16);
    const beat = state.tickCount % 16;

    const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordTones = getChordTones(rootDegree);

    // Bass: Classic on-beat/off-beat trance bass
    if (state.enabledParts.bass && beat % 2 === 0) { // Play on every 8th note
        const bassDegree = (beat % 4 === 0) ? rootDegree : (rootDegree + 4); // Root and 5th
        const freq = getFrequencyFromDegree(bassDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '16n', vel: 1.0 }, time });
        }
    }

    // Accompaniment: Fast 16th note arpeggio
    if (state.enabledParts.accompaniment) {
        const arpPattern = [0, 1, 0, 2, 0, 1, 0, 2]; // Classic trance arp
        const patternIndex = beat % arpPattern.length;
        const degree = chordTones[arpPattern[patternIndex]];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
        }
    }

    // Melody: Slower, more sparse melody line
    if (state.enabledParts.melody && beat === 0 && Math.random() < 0.6) {
        let nextDegree;
        if (state.lastMelodyDegree !== null && Math.random() < 0.7) {
            nextDegree = state.lastMelodyDegree + (Math.random() < 0.5 ? 1 : -1);
        } else {
            nextDegree = chordTones[Math.floor(Math.random() * chordTones.length)];
        }
        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.7 }, time });
            state.lastMelodyDegree = nextDegree;
        }
    }
    
    // Effects
    if (state.enabledParts.effects && time >= state.nextEffectTime) {
        if (Math.random() < 0.2) {
            const effectRoot = state.chordProgression[Math.floor(Math.random() * state.chordProgression.length)];
            const freq = getFrequencyFromDegree(effectRoot, 'melody');
             if (freq) {
                 const effectType = state.effectTypes[Math.floor(Math.random() * state.effectTypes.length)];
                 self.postMessage({ type: 'playNote', note: { type: effectType, freq: freq * 2, dur: '4n', vel: Math.random() * 0.2 + 0.3 }, time });
             }
        }
        state.nextEffectTime = time + (Math.random() * 4 + 2); // 2 to 6 seconds
    }
}

// --- MAIN WORKER LOGIC ---

function tick(time) {
    if (!state.isStarted) return;
    generateTrance(time);
    state.tickCount++;
}

self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            if (!state.isStarted) {
                state.isStarted = true;
                state.tickCount = 0;
                state.nextEffectTime = 0; // Reset effect timer
                updateHarmony();
            }
            break;
        case 'stop':
            state.isStarted = false;
            state.tickCount = 0;
            break;
        case 'tick':
            if (state.isStarted) {
                tick(data.time);
            }
            break;
        case 'setTempo':
            state.currentBpm = data.bpm;
            break;
        case 'setHarmony':
            Object.assign(state, data);
            if (state.isStarted) {
                updateHarmony();
            }
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
    }
};
