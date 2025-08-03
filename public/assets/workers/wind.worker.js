
// --- AUTOPILOT WORKER: WIND ---
// Inspired by gentle, arpeggiated patterns like Led Zeppelin's "Stairway to Heaven" intro.

// --- UTILITIES ---
function getNoteFrequency(key, octave, interval) {
    const A4 = 440;
    const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
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

// --- STATE ---
let state = {
    // Timing
    tickCount: 0,
    subdivisions: 16, // 16th notes
    // Music Context
    key: 'C',
    scale: 'Minor',
    bpm: 90,
    chordProgression: [0, 6, 5, 4], // i-VII-VI-V progression common in folk/rock
    scaleIntervals: [],
    enabledParts: { bass: true, accompaniment: true, melody: true, effects: true },
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    // Generation Logic
    lastArpDirection: 1,
    lastMelodyNoteTime: 0,
};

// --- MUSIC LOGIC ---
function updateMusicContext() {
    state.scaleIntervals = scaleIntervalMap[state.scale] || [];
    state.scaleFrequencies.bass = getScaleFrequenciesForOctaves(state.key, state.scale, [1, 2]);
    state.scaleFrequencies.accompaniment = getScaleFrequenciesForOctaves(state.key, state.scale, [3, 4]);
    state.scaleFrequencies.melody = getScaleFrequenciesForOctaves(state.key, state.scale, [4, 5]);

    if (state.scale.includes('Major')) {
        state.chordProgression = [0, 3, 4, 0]; // I-IV-V-I
    } else {
        state.chordProgression = [0, 5, 4, 0]; // i-VI-V-i
    }
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

function tick(time) {
    const measure = Math.floor(state.tickCount / state.subdivisions);
    const beat = state.tickCount % state.subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % state.chordProgression.length;
    const rootDegree = state.chordProgression[chordIndex];
    const chordTones = getChordTones(rootDegree);

    // --- Bass ---
    // Plays a single, airy note at the start of every other measure.
    if (state.enabledParts.bass && state.tickCount % 32 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.7 }, time });
        }
    }

    // --- Accompaniment (The "Wind" Arpeggio) ---
    // Plays a gentle, syncopated 8th-note arpeggio.
    if (state.enabledParts.accompaniment && (beat % 2 === 1)) { // Play on off-beats
        const arpPattern = [0, 1, 2, 1, 2, 3, 4, 3];
        const patternIndex = Math.floor(beat / 2) % arpPattern.length;
        
        const degree = chordTones[arpPattern[patternIndex] % chordTones.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');

        if (freq) {
            postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.45 }, time });
        }
    }

    // --- Melody ---
    // Plays a very sparse melody note.
    if (state.enabledParts.melody && time > state.lastMelodyNoteTime + 8) {
         if (Math.random() < 0.05) { // Very low probability
            const degree = chordTones[Math.floor(Math.random() * chordTones.length)];
            const freq = getFrequencyFromDegree(degree, 'melody');
            if (freq) {
                 postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.6 }, time });
                 state.lastMelodyNoteTime = time;
            }
         }
    }

    state.tickCount++;
}

// --- WORKER EVENT HANDLER ---
let tickInterval;
self.onmessage = function (event) {
    const { type, ...data } = event.data;

    switch (type) {
        case 'start':
            state.tickCount = 0;
            state.lastMelodyNoteTime = 0;
            updateMusicContext();
            clearInterval(tickInterval);
            tickInterval = setInterval(() => tick(Tone.now()), 60000 / state.bpm / (state.subdivisions / 4));
            break;
        case 'stop':
            clearInterval(tickInterval);
            break;
        case 'tick':
             // The loop is now self-driven by setInterval, but we can use this for external sync if needed.
            break;
        case 'setHarmony':
            state.key = data.key;
            state.scale = data.scale;
            updateMusicContext();
            break;
        case 'setTempo':
            state.bpm = data.bpm;
            if (tickInterval) { // If it's already running, restart with new tempo
                clearInterval(tickInterval);
                tickInterval = setInterval(() => tick(Tone.now()), 60000 / state.bpm / (state.subdivisions / 4));
            }
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
    }
};

// We need to import the Tone.js library to have access to Tone.now()
// This is a common pattern for web workers.
// The actual import is handled by the browser when the worker is created.
// We'll assume a global Tone object for the purpose of this file's logic.
// In a real build setup, you'd configure this properly.
const Tone = { now: () => self.performance.now() / 1000 };
