// drone.worker.js - Pink Floyd "Echoes" inspired drone
'use strict';

// --- TYPE DEFINITIONS (from a shared source if possible, but duplicated for worker self-containment) ---
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

// --- WORKER STATE ---
let state = {
    isRunning: false,
    tickCount: 0,
    currentKey: 'C',
    currentScale: 'Major Pentatonic',
    scaleIntervals: [],
    chordProgression: [0, 4, 5, 3],
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true },
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    lastBassTime: 0,
    lastEffectTime: 0,
    bassNoteDuration: '1m', // Each bass note lasts for 4 measures (1m = 4 measures in Tone.js)
};

// --- MUSIC THEORY & UTILS ---
function updateMusicContext() {
    state.scaleIntervals = scaleIntervalMap[state.currentScale] || [];
    const bassOctaves = [1, 2]; // Very low octaves for the drone
    const melodyOctaves = [5, 6]; // High octaves for the "ping"

    state.scaleFrequencies.bass = getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, bassOctaves);
    state.scaleFrequencies.melody = getScaleFrequenciesForOctaves(state.currentKey, state.currentScale, melodyOctaves);

    if (state.currentScale.includes('Major')) {
        state.chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        state.chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
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
    const scaleLength = state.scaleIntervals.length;
    if (!freqs || freqs.length === 0 || !scaleLength) return null;

    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    return (finalIndex >= 0 && finalIndex < freqs.length) ? freqs[finalIndex] : null;
}

// --- CORE WORKER LOGIC ---
function tick(time) {
    if (!state.isRunning) return;

    const subdivisions = 64; // 4 measures * 16th notes
    const measure = Math.floor(state.tickCount / 16);
    const chordIndex = Math.floor(measure / 4) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];

    // --- Bass Drone ---
    // Trigger a new bass note only every 4 measures (64 ticks at 16th notes)
    if (state.enabledParts.bass && state.tickCount % subdivisions === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({
                type: 'playNote',
                note: {
                    type: 'autopilot_bass',
                    freq: freq,
                    dur: state.bassNoteDuration,
                    vel: 0.7
                },
                time: time
            });
        }
    }

    // --- "Echoes" Ping Effect ---
    // Trigger a high, clear "ping" very rarely.
    // Let's try every 8 measures (128 ticks), but with some randomness.
    if (state.enabledParts.effects && state.tickCount % 128 === 0 && Math.random() < 0.8) {
        const pingDegree = state.chordProgression[Math.floor(Math.random() * state.chordProgression.length)] + (state.scaleIntervals.length * 3);
        const freq = getFrequencyFromDegree(pingDegree, 'melody');
        if (freq) {
             self.postMessage({
                type: 'playNote',
                note: {
                    type: 'autopilot_effect_echoes',
                    freq: freq,
                    dur: '2n',
                    vel: 0.8
                },
                time: time
            });
        }
    }
    
    // Disable accompaniment and regular melody for this style
    // state.enabledParts.accompaniment = false;
    // state.enabledParts.melody = false;

    state.tickCount++;
}

// --- EVENT HANDLER ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            if (!state.isRunning) {
                state.isRunning = true;
                state.tickCount = 0;
                updateMusicContext();
            }
            break;
        case 'stop':
            state.isRunning = false;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setHarmony':
            state.currentKey = data.key;
            state.currentScale = data.scale;
            updateMusicContext();
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
        case 'setTempo':
            // Tempo doesn't drastically change the logic here, but good to have
            break;
    }
};
