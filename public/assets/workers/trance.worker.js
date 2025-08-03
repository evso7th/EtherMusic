/**
 * EtherMusic Autopilot Worker: Trance Style
 * Author: EVS
 *
 * This worker generates music in a classic trance style, characterized by a driving
 * on-beat/off-beat bassline and fast, hypnotic arpeggios.
 */

// --- SHARED STATE & UTILITY FUNCTIONS ---
const state = {
    // Timing
    tickCount: 0,
    measure: 0,
    beat: 0,
    subdivisions: 16,
    lastScheduledTime: 0,

    // Music Theory
    key: 'C',
    scale: 'Minor',
    scaleIntervals: [],
    chordProgression: [], // e.g., i-VI-III-VII
    
    // Frequencies
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
        effects: []
    },
    
    // Settings
    enabledParts: {
        bass: true,
        accompaniment: true,
        melody: true,
        effects: true
    },
    
    // Generative State
    lastMelodyDegree: null,
    nextEffectTime: 0,
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

function updateMusicContext(data) {
    state.key = data.key;
    state.scale = data.scale;
    state.scaleIntervals = scaleIntervalMap[state.scale] || [];
    
    state.scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(state.key, state.scale, data.bassOctaves || [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(state.key, state.scale, data.accompanimentOctaves || [3, 4]),
        melody: getScaleFrequenciesForOctaves(state.key, state.scale, data.melodyOctaves || [4, 5]),
        effects: getScaleFrequenciesForOctaves(state.key, state.scale, data.melodyOctaves || [4, 5, 6]),
    };

    // Classic Trance progression (i-VI-III-VII)
    if (state.scale.includes('Minor')) {
        state.chordProgression = [0, 5, 2, 6]; 
    } else { // Fallback for Major scales
        state.chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    }
    state.lastMelodyDegree = null;
}

function getFrequencyFromDegree(degree, part) {
    const freqs = state.scaleFrequencies[part];
    const scaleLength = state.scaleIntervals.length;

    if (!freqs || freqs.length === 0 || !scaleLength) return null;
    
    // Normalize degree to be within the scale
    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }
    return null; // Return null if degree is out of the available frequency range
}

function getChordTones(rootDegree) {
    const chordTones = [];
    if (!state.scaleIntervals.length) return [];
    
    for (let i = 0; i < 4; i++) { // Get 4 notes for a 7th chord
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}


// --- STYLE-SPECIFIC GENERATORS ---
function tick(time) {
    // If there's a significant gap in time, reset the tick counter to avoid runaway loops
    if (time > state.lastScheduledTime + 0.2) { 
        state.tickCount = Math.floor(state.tickCount / state.subdivisions) * state.subdivisions;
    }
    state.lastScheduledTime = time;

    state.measure = Math.floor(state.tickCount / state.subdivisions);
    state.beat = state.tickCount % state.subdivisions;
    
    const rootDegree = state.chordProgression[Math.floor(state.measure / 2) % state.chordProgression.length];
    const chordToneDegrees = getChordTones(rootDegree);

    // Bass (Trance style: On-beat/off-beat, but slower)
    if (state.enabledParts.bass && state.beat % 4 === 0) { // Every 4th note (half speed)
        const octaveShift = state.beat % 8 === 0 ? 0 : 7; // Root on beat, 5th on off-beat
        const degree = rootDegree + octaveShift;
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 0.9 }, time });
        }
    }

    // Accompaniment (Slower arpeggio)
    if (state.enabledParts.accompaniment && state.beat % 2 === 0) { // Every 8th note (half speed)
        const arpPattern = [0, 1, 2, 1, 2, 3, 2, 1];
        const patternIndex = Math.floor(state.beat / 2) % arpPattern.length;
        const degree = chordToneDegrees[arpPattern[patternIndex]];

        if (degree !== undefined) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.45 }, time });
            }
        }
    }

    // Melody (Less frequent)
    if (state.enabledParts.melody && state.beat === 0 && Math.random() < 0.5) {
        let nextDegree;
        if (state.lastMelodyDegree !== null && Math.random() < 0.7) {
            const direction = Math.random() < 0.5 ? 1 : -1;
            nextDegree = state.lastMelodyDegree + direction;
        } else {
            nextDegree = chordToneDegrees[Math.floor(Math.random() * 2)]; // Stick to root or third
        }
        
        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.6 }, time });
            state.lastMelodyDegree = nextDegree;
        }
    }
    
    // Effects
    if (state.enabledParts.effects && time > state.nextEffectTime) {
        if (Math.random() < 0.2) {
            const effectRoot = chordToneDegrees[0];
            const freq = getFrequencyFromDegree(effectRoot, 'effects');
            if (freq) {
                // A simple "whoosh" effect
                 self.postMessage({ type: 'playNote', note: { type: 'autopilot_effect_wind', freq: freq * 2, dur: '1m', vel: 0.2 }, time });
            }
        }
        state.nextEffectTime = time + (Math.random() * 5 + 5); // every 5-10 seconds
    }
    
    state.tickCount++;
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
            state.enabledParts = data.parts;
            break;
        case 'start':
        case 'stop':
            // Reset counters on transport changes
            state.tickCount = 0;
            state.lastScheduledTime = 0;
            state.nextEffectTime = 0;
            break;
    }
};
