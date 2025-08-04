// --- AUTOPILOT WORKER ---
// This single worker contains the music generation logic for all autopilot styles.
// It receives synchronized 'tick' events from the main thread and responds with note data.
// It is designed to be lightweight and performant to avoid audio artifacts.

// --- TYPE DEFINITIONS (for clarity, not enforced in JS) ---
/*
type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';
type AutopilotStyle = 'Ambient' | 'Trance' | 'Sequence' | 'Chimes' | 'Drone' | 'Toccata' | 'Promenade' | 'Space';
type AutopilotPart = 'bass' | 'accompaniment' | 'melody' | 'effects';
type InstrumentType = string;
type NoteEvent = {
    type: InstrumentType;
    freq: number;
    dur: any; // Tone.js time unit
    vel: number;
};
*/

// --- WORKER STATE ---
let state = {
    // Music Context
    key: 'C',
    scale: 'Major Pentatonic',
    style: 'Ambient',
    bpm: 90,
    scaleIntervals: [], // e.g., [0, 2, 4, 7, 9]
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    chordProgression: [0, 4, 5, 3],

    // Part Enablement
    enabledParts: {
        bass: true,
        accompaniment: true,
        melody: true,
        effects: true
    },

    // Generation State
    tickCount: 0,
    lastMelodyDegree: null,
    lastAccompanimentDegree: null,
};

const subdivisions = 16; // Using 16th notes as the smallest unit

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
    return allFrequencies.sort((a, b) => a - b);
}

function updateMusicContext(data) {
    state.key = data.key;
    state.scale = data.scale;
    state.scaleIntervals = scaleIntervalMap[state.scale] || [];
    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(state.key, state.scale, data.bassOctaves),
        accompaniment: getScaleFrequenciesForOctaves(state.key, state.scale, data.accompanimentOctaves),
        melody: getScaleFrequenciesForOctaves(state.key, state.scale, data.melodyOctaves),
    };

    if (state.scale.includes('Major')) {
        state.chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        state.chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
    state.lastMelodyDegree = null;
    state.lastAccompanimentDegree = null;
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
    const chordTones = [];
    for (let i = 0; i < 3; i++) {
        chordTones.push(rootDegree + i * 2);
    }
    return chordTones;
}

// --- STYLE-SPECIFIC GENERATORS ---

const effectTypes = [
    'autopilot_effect_star', 'autopilot_effect_meteor', 'autopilot_effect_warp', 'autopilot_effect_hole',
    'autopilot_effect_pulsar', 'autopilot_effect_nebula', 'autopilot_effect_comet', 'autopilot_effect_wind', 'autopilot_effect_echoes'
];


function generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees) {
    // Slow, melodic fill on quarter notes for the 4th measure.
    if (beat % 4 !== 0) return;
    const fillPattern = [chordToneDegrees[0], chordToneDegrees[1], chordToneDegrees[2], chordToneDegrees[1]];
    const degree = fillPattern[Math.floor(beat / 4)];
    const freq = getFrequencyFromDegree(degree, 'accompaniment');
    if (freq) {
        self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.5 }, time });
    }
}


function generateEffects(time, rootDegree, probability = 0.1) {
    if (state.enabledParts.effects && Math.random() < probability) {
        const freq = getFrequencyFromDegree(rootDegree + 7, 'melody');
        if (freq) {
            const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
            const numNotes = Math.floor(Math.random() * 4) + 2;
            for (let i = 0; i < numNotes; i++) {
                const effectFreq = freq * Math.pow(1.05946, i * 2 + (Math.random() - 0.5) * 4);
                self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '4n', vel: Math.random() * 0.2 + 0.3 }, time: time + i * 0.15 });
            }
        }
    }
}

function generateMelody(time, beat, chordToneDegrees) {
    // OPTIMIZED: Only run logic on quarter notes (beat % 4 === 0)
    if (!state.enabledParts.melody || beat % 4 !== 0) return;

    let nextDegree;
    if (state.lastMelodyDegree !== null) {
        const direction = Math.random() < 0.5 ? 1 : -1;
        const leap = Math.random() < 0.2 ? 2 : 1; // 20% chance of a leap
        nextDegree = state.lastMelodyDegree + (direction * leap);
    } else {
        nextDegree = chordToneDegrees[0];
    }

    const freq = getFrequencyFromDegree(nextDegree, 'melody');
    const duration = Math.random() < 0.3 ? '8n' : '4n'; // Rhythmic variety

    if (freq) {
        self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: duration, vel: 0.7 }, time });
        state.lastMelodyDegree = nextDegree;
    } else {
        state.lastMelodyDegree = chordToneDegrees[0]; // Reset if out of bounds
    }
}


// --- MAIN GENERATION LOGIC ---

const styleGenerators = {
    'Ambient': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && beat === 0) {
            const freq = getFrequencyFromDegree(rootDegree, 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else if (beat % 8 === 0) {
                chordToneDegrees.forEach((degree, index) => {
                    const freq = getFrequencyFromDegree(degree, 'accompaniment');
                    if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '1n', vel: 0.4 }, time: time + index * 0.02 });
                });
            }
        }
        generateMelody(time, beat, chordToneDegrees);
        generateEffects(time, rootDegree, 0.05);
    },
    'Trance': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && beat % 4 === 0) {
            const freq = getFrequencyFromDegree(rootDegree, 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else {
                const arpPattern = [0, 1, 2, 1];
                const degree = chordToneDegrees[arpPattern[beat % arpPattern.length]];
                const freq = getFrequencyFromDegree(degree, 'accompaniment');
                if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
            }
        }
        generateMelody(time, beat, chordToneDegrees);
    },
    'Sequence': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && (beat === 0 || beat === 8)) {
            const freq = getFrequencyFromDegree(rootDegree, 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else {
                if ([0, 3, 4, 7, 10, 12, 14, 15].includes(beat)) {
                    const degree = chordToneDegrees[(beat + Math.floor(beat/4)) % chordToneDegrees.length];
                    const freq = getFrequencyFromDegree(degree, 'accompaniment');
                    if(freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.65 }, time });
                }
            }
        }
        generateMelody(time, beat, chordToneDegrees);
    },
    'Chimes': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && (beat === 0 || beat === 8)) {
            const freq = getFrequencyFromDegree(rootDegree, 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else {
                const arpPattern = [0, 2, 1, 3, 0, 3, 1, 2];
                const degree = chordToneDegrees[arpPattern[beat % arpPattern.length]];
                const freq = getFrequencyFromDegree(degree, 'accompaniment');
                if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
            }
        }
        generateMelody(time, beat, chordToneDegrees);
    },
    'Drone': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && beat === 0) {
            const freq = getFrequencyFromDegree(rootDegree, 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.7 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else if (beat === 0) {
                chordToneDegrees.forEach((degree, index) => {
                    const freq = getFrequencyFromDegree(degree, 'accompaniment');
                    if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '1m', vel: 0.4 }, time: time + index * 0.02 });
                });
            }
        }
        if (state.enabledParts.melody && beat === 0 && measure % 4 === 0) {
            const freq = getFrequencyFromDegree(chordToneDegrees[0] + state.scaleIntervals.length, 'melody');
            if(freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
        }
        if (state.enabledParts.effects && (beat === 4 || beat === 12)) {
            const freq = getFrequencyFromDegree(rootDegree + state.scaleIntervals.length + 4, 'melody');
            if(freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_effect_echoes', freq, dur: '8n', vel: 0.8 }, time });
        }
    },
    'Toccata': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && (beat === 0 || beat === 8)) {
            const freq = getFrequencyFromDegree(beat === 0 ? rootDegree : chordToneDegrees[2], 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else {
                const degree = chordToneDegrees[beat % chordToneDegrees.length];
                const freq = getFrequencyFromDegree(degree, 'accompaniment');
                if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.5 }, time });
            }
        }
        // Toccata has its own fast melody
        if (state.enabledParts.melody) {
            let nextDegree;
            if (state.lastMelodyDegree !== null) {
                nextDegree = state.lastMelodyDegree + (Math.random() < 0.6 ? 1 : -1);
            } else {
                nextDegree = chordToneDegrees[0];
            }
            const freq = getFrequencyFromDegree(nextDegree, 'melody');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '16n', vel: 0.7 }, time });
                state.lastMelodyDegree = nextDegree;
            } else {
                state.lastMelodyDegree = chordToneDegrees[0];
            }
        }
    },
    'Promenade': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && beat % 4 === 0) {
            const bassPattern = [rootDegree, chordToneDegrees[1], chordToneDegrees[2], chordToneDegrees[1]];
            const degree = bassPattern[Math.floor(beat / 4) % bassPattern.length];
            const freq = getFrequencyFromDegree(degree, 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else if (beat % 8 === 4) {
                chordToneDegrees.forEach((degree, index) => {
                    const freq = getFrequencyFromDegree(degree, 'accompaniment');
                    if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.6 }, time: time + index * 0.01 });
                });
            }
        }
        if (state.enabledParts.melody && beat % 8 === 0) {
            const melodyPattern = [0, 2, 4, 2];
            const degree = chordToneDegrees[0] + melodyPattern[Math.floor(beat / 8) % melodyPattern.length];
            const freq = getFrequencyFromDegree(degree, 'melody');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.7 }, time });
        }
    },
    'Space': (time, beat, measure, rootDegree, chordToneDegrees) => {
        const isFillMeasure = measure % 4 === 3;
        if (state.enabledParts.bass && beat === 0) {
            const freq = getFrequencyFromDegree(rootDegree - state.scaleIntervals.length, 'bass');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.9 }, time });
        }
        if (state.enabledParts.accompaniment) {
            if (isFillMeasure) {
                generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
            } else if (beat % 2 === 0) {
                const arpPattern = [0, 0, 1, 1, 2, 2, 1, 1];
                const degree = chordToneDegrees[arpPattern[Math.floor(beat/2) % arpPattern.length]];
                const freq = getFrequencyFromDegree(degree, 'accompaniment');
                if(freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.6 }, time });
            }
        }
        if (state.enabledParts.melody && beat === 0) {
            const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
            const freq = getFrequencyFromDegree(degree + state.scaleIntervals.length, 'melody');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
        }
        generateEffects(time, rootDegree, 0.25);
    },
};


// --- WORKER EVENT HANDLER ---

self.onmessage = function (e) {
    const { type, ...data } = e.data;

    switch (type) {
        case 'setTempo':
            state.bpm = data.bpm;
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
        case 'setHarmony':
            updateMusicContext(data);
            break;
        case 'setStyle':
            state.style = data.style;
            state.tickCount = 0; // Reset on style change
            state.lastMelodyDegree = null;
            break;
        case 'tick': {
            const { time } = data;
            const measure = Math.floor(state.tickCount / subdivisions);
            const beat = state.tickCount % subdivisions;
            const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
            const rootDegree = state.chordProgression[chordIndex];
            const chordToneDegrees = getChordTones(rootDegree);

            const generator = styleGenerators[state.style] || styleGenerators['Ambient'];
            generator(time, beat, measure, rootDegree, chordToneDegrees);

            state.tickCount++;
            break;
        }
        case 'start':
            state.tickCount = 0;
            state.lastMelodyDegree = null;
            break;
        case 'stop':
            state.tickCount = 0;
            state.lastMelodyDegree = null;
            break;
    }
};
