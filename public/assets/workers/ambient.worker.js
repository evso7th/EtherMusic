// --- AUTOPILOT MUSIC GENERATION WORKER ---

// This worker is responsible for generating all the musical patterns for the autopilot feature.
// It receives ticks from the main thread and generates notes based on the selected style.
// IMPORTANT: This worker should not contain any timing logic (setTimeout, setInterval).
// It must be a "pure" generator that responds to external ticks.

// --- TYPE DEFINITIONS (from main thread) ---
// type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
// type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';
// type AutopilotStyle = 'Ambient' | 'Trance' | 'Sequence' | 'Chimes' | 'Drone' | 'Toccata' | 'Promenade' | 'Space';
// type AutopilotPart = 'bass' | 'accompaniment' | 'melody' | 'effects';
// type InstrumentType = string;
// type UnitTime = string | number;

// --- WORKER STATE ---
let tickCount = 0;
const subdivisions = 16; // We think in 16th notes per measure

let currentKey = 'C';
let currentScale = 'Major Pentatonic';
let currentStyle = 'Ambient';
let currentBpm = 90;
let enabledParts = {
    bass: true,
    accompaniment: true,
    melody: true,
    effects: true
};

// Music Theory State
let scaleIntervals = [];
let chordProgression = [0, 4, 5, 3];
let scaleFrequencies = {
    bass: [],
    accompaniment: [],
    melody: [],
};

// Melody Generation State
let lastMelodyNote = {
    degree: null,
    nextBeat: 0 // The beat at which the next melody note should be played
};
let lastAccompanimentNote = {
    degree: null,
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
    return allFrequencies.sort((a, b) => a - b);
}

function updateMusicContext(data) {
    currentKey = data.key;
    currentScale = data.scale;
    scaleIntervals = scaleIntervalMap[currentScale] || [];

    scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(currentKey, currentScale, data.bassOctaves),
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, data.accompanimentOctaves),
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, data.melodyOctaves),
    };

    if (currentScale.includes('Major')) {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
    lastMelodyNote = { degree: null, nextBeat: 0 };
    lastAccompanimentNote = { degree: null };
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
    if (!scaleIntervals.length) return [];
    const chordTones = [];
    for (let i = 0; i < 3; i++) {
        const degreeIndex = rootDegree + i * 2;
        chordTones.push(degreeIndex);
    }
    return chordTones;
}

// --- IMPROVED MELODY GENERATION LOGIC ---
function generateMelodyNote(time, beat, chordToneDegrees) {
    if (!enabledParts.melody || beat < lastMelodyNote.nextBeat) {
        return;
    }

    // 1. Rhythmic Variety
    const possibleDurations = [
        { beatLength: 4, name: '4n' },  // Quarter note
        { beatLength: 2, name: '8n' },  // 8th note
        { beatLength: 8, name: '2n' },  // Half note
        { beatLength: 6, name: '4n.'}  // Dotted quarter
    ];
    const duration = possibleDurations[Math.floor(Math.random() * possibleDurations.length)];
    lastMelodyNote.nextBeat = beat + duration.beatLength; // Schedule next note

    // 2. Melodic Leaps
    let nextDegree;
    if (lastMelodyNote.degree === null) {
        nextDegree = chordToneDegrees[0];
    } else {
        const direction = Math.random() < 0.5 ? 1 : -1;
        const leapProb = Math.random();
        let step;
        if (leapProb < 0.7) {
            step = 1; // Stepwise motion
        } else if (leapProb < 0.9) {
            step = 2; // A third
        } else {
            step = 3; // A fourth
        }
        nextDegree = lastMelodyNote.degree + (direction * step);

        // Keep melody within a reasonable range (e.g., 2 octaves)
        if (nextDegree > (chordToneDegrees[0] + scaleIntervals.length * 2) || nextDegree < chordToneDegrees[0]) {
             nextDegree = lastMelodyNote.degree - (direction * step); // reverse direction if out of range
        }
    }
    
    const freq = getFrequencyFromDegree(nextDegree, 'melody');
    if (freq) {
        self.postMessage({
            type: 'playNote',
            note: { type: 'autopilot_melody', freq, dur: duration.name, vel: 0.7 },
            time
        });
        lastMelodyNote.degree = nextDegree;
    } else {
        // Reset if we get an invalid frequency
        lastMelodyNote.degree = chordToneDegrees[0];
    }
}


// --- ACCOMPANIMENT FILL GENERATION ---
function generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees) {
    if (!enabledParts.accompaniment) return;
    
    const fillPatterns = [
        [chordToneDegrees[0], chordToneDegrees[1], chordToneDegrees[2], chordToneDegrees[1]], // Arpeggio up and down
        [rootDegree, rootDegree, rootDegree, chordToneDegrees[2]], // Repeated root then leap
        [chordToneDegrees[0], null, chordToneDegrees[1], null], // Sparse
    ];
    
    // Pick a random fill pattern for the measure
    const pattern = fillPatterns[Math.floor(Math.random() * fillPatterns.length)];
    
    if (beat % 4 === 0) { // Play on quarter notes
        const patternIndex = Math.floor(beat / 4);
        const degree = pattern[patternIndex];
        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({
                    type: 'playNote',
                    note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.5 },
                    time
                });
            }
        }
    }
}


// --- STYLE-SPECIFIC GENERATORS ---
function generateAmbient(time, beat, measure, rootDegree, chordToneDegrees) {
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
    }

    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment && beat % 8 === 0) {
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '1n', vel: 0.4 }, time: time + index * 0.02 });
        });
    }

    generateMelodyNote(time, beat, chordToneDegrees);
}

function generateTrance(time, beat, measure, rootDegree, chordToneDegrees) {
    const cycleLength = 16;
    const currentCycleMeasure = measure % cycleLength;

    if (enabledParts.bass && beat % 4 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
    }

    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment) {
        let octaveOffset = 0;
        if (currentCycleMeasure >= 4 && currentCycleMeasure < 8) octaveOffset = -scaleIntervals.length;
        else if (currentCycleMeasure >= 8 && currentCycleMeasure < 12) octaveOffset = -2 * scaleIntervals.length;
        else if (currentCycleMeasure >= 12) octaveOffset = -3 * scaleIntervals.length;

        const arpPattern = [0, 1, 2, 1, 2, 0, 1, 2];
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex % chordToneDegrees.length] + octaveOffset;
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
    }
    
    generateMelodyNote(time, beat, chordToneDegrees);
}


function generateToccata(time, beat, measure, rootDegree, chordToneDegrees) {
    if (enabledParts.bass && (beat === 0 || beat === 8)) {
        const degree = beat === 0 ? rootDegree : chordToneDegrees[2];
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
    }
    
    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment) {
        const degree = chordToneDegrees[beat % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.5 }, time });
    }
    
    generateMelodyNote(time, beat, chordToneDegrees);
}

function generatePromenade(time, beat, measure, rootDegree, chordToneDegrees) {
    if (enabledParts.bass && beat % 4 === 0) {
        const bassPattern = [rootDegree, chordToneDegrees[1], chordToneDegrees[2], chordToneDegrees[1]];
        const degree = bassPattern[Math.floor(beat / 4) % bassPattern.length];
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
    }
    
    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment && beat % 8 === 4) {
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.6 }, time: time + index * 0.01 });
        });
    }

    generateMelodyNote(time, beat, chordToneDegrees);
}

function generateSpace(time, beat, measure, rootDegree, chordToneDegrees) {
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree - scaleIntervals.length, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.9 }, time });
    }

    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment) {
        const arpPattern = [0, 0, 1, 1, 2, 2, 1, 1];
        const patternIndex = Math.floor(beat / 2) % arpPattern.length;
        if (beat % 2 === 0) {
            const degree = chordToneDegrees[patternIndex];
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.6 }, time });
        }
    }

    generateMelodyNote(time, beat, chordToneDegrees);
}

function generateSequence(time, beat, measure, rootDegree, chordToneDegrees) {
    const cycleMeasure = measure % 16;
    
    if (enabledParts.bass && (beat === 0 || (cycleMeasure > 4 && beat === 8))) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
    }

    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment && cycleMeasure >= 2) {
        let rhythmPattern = [0, 3, 4, 7, 10, 12, 14, 15];
        if (rhythmPattern.includes(beat)) {
            const basePattern = [0, 2, 1, 3, 0, 1, 2, 1];
            const noteIndex = rhythmPattern.indexOf(beat) % basePattern.length;
            let degree = chordToneDegrees[basePattern[noteIndex] % chordToneDegrees.length] || rootDegree;
            if (cycleMeasure >= 8) degree += scaleIntervals.length;
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.65 }, time });
        }
    }

    if (cycleMeasure >= 4) {
        generateMelodyNote(time, beat, chordToneDegrees);
    }
}

function generateChimes(time, beat, measure, rootDegree, chordToneDegrees) {
    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment) {
        const arpPattern = [0, 2, 1, 3, 0, 3, 1, 2];
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
    }

    if (enabledParts.bass && (beat === 0 || beat === 8)) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
    }
    
    generateMelodyNote(time, beat, chordToneDegrees);
}

function generateDrone(time, beat, measure, rootDegree, chordToneDegrees) {
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.7 }, time });
    }

    if (measure % 4 === 3) {
        generateAccompanimentFill(time, beat, rootDegree, chordToneDegrees);
    } else if (enabledParts.accompaniment && beat === 0) {
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '1m', vel: 0.4 + (Math.random() * 0.2) }, time: time + index * 0.02 });
        });
    }

    generateMelodyNote(time, beat, chordToneDegrees);
}

// --- MAIN TICK FUNCTION ---
function tick(time) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;

    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    const styleGenerators = {
        'Ambient': generateAmbient,
        'Trance': generateTrance,
        'Sequence': generateSequence,
        'Chimes': generateChimes,
        'Drone': generateDrone,
        'Toccata': generateToccata,
        'Promenade': generatePromenade,
        'Space': generateSpace,
    };

    const generator = styleGenerators[currentStyle] || generateAmbient;
    generator(time, beat, measure, rootDegree, chordToneDegrees);

    tickCount++;
}


// --- WORKER EVENT HANDLER ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;

    switch (type) {
        case 'tick':
            tick(data.time);
            break;
        case 'setHarmony':
            updateMusicContext(data);
            break;
        case 'setParts':
            enabledParts = data.parts;
            break;
        case 'setStyle':
            currentStyle = data.style;
            // Reset state when style changes to avoid weird transitions
            lastMelodyNote = { degree: null, nextBeat: 0 };
            lastAccompanimentNote = { degree: null };
            tickCount = 0;
            break;
        // Other cases like setTempo, start, stop are not needed here
        // as this worker is purely reactive to 'tick'
    }
};

    