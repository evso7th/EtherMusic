
// --- AUTOPILOT-WORKER: DRONE ---
// This worker creates a deep, slowly evolving soundscape inspired by Pink Floyd's "Echoes".
// It features a very slow bass drone, a sustained pad-like accompaniment, and sparse, high-frequency "ping" effects.

// --- TYPE DEFINITIONS (provided by the AutopilotEngine) ---
// NoteEvent, WorkerEvent, WorkerResponse, MusicKey, MusicScale, InstrumentType, Unit, AutopilotPart

// --- WORKER STATE ---
let state = {
    // Music Theory
    currentKey: 'C',
    currentScale: 'Minor',
    scaleIntervals: [],
    chordProgression: [], // Will be set based on scale
    scaleFrequencies: {
        bass: [],
        accompaniment: [],
        melody: [],
    },
    // Timing & Sequencing
    tickCount: 0,
    subdivisions: 16, // 16th notes
    currentBpm: 90,
    nextEffectTime: 0,
    // Enabled Parts
    enabledParts: {
        bass: true,
        accompaniment: true, // Now enabled for the pad sound
        melody: false,       // Melody is intentionally sparse/off in this style
        effects: true,
    },
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

function getFrequencyFromDegree(degree, part) {
    const freqs = state.scaleFrequencies[part];
    const scaleLength = state.scaleIntervals.length;

    if (!freqs || freqs.length === 0 || !scaleLength) return null;

    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    return (finalIndex >= 0 && finalIndex < freqs.length) ? freqs[finalIndex] : null;
}

// --- WORKER LOGIC ---

function tick(time) {
    const measure = Math.floor(state.tickCount / state.subdivisions);
    const beat = state.tickCount % state.subdivisions;

    // The entire drone revolves around one chord for a long time
    const rootDegree = state.chordProgression[Math.floor(measure / 4) % state.chordProgression.length];

    // --- Bass Drone ---
    // Plays a new note only once every 4 measures (16 beats)
    if (state.enabledParts.bass && (state.tickCount % (state.subdivisions * 4) === 0)) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({
                type: 'playNote',
                note: { type: 'autopilot_bass', freq, dur: '4m', vel: 0.7 },
                time
            });
        }
    }

    // --- Accompaniment (Enveloping Pad) ---
    // Plays a long, sustained note from the chord every 2 measures
    if (state.enabledParts.accompaniment && (state.tickCount % (state.subdivisions * 2) === 0)) {
        // Choose the third or fifth of the chord for the pad
        const degree = rootDegree + (Math.random() < 0.5 ? 2 : 4);
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({
                type: 'playNote',
                note: { type: 'autopilot_accompaniment', freq, dur: '2m', vel: 0.35 },
                time
            });
        }
    }

    // --- Effects ("Pings") ---
    // Triggers effects more frequently
    if (state.enabledParts.effects && time >= state.nextEffectTime) {
         if (Math.random() < 0.3) { // Increased probability from 0.1 to 0.3
             // Choose a high note from the scale for the "ping"
            const degree = rootDegree + 7 + Math.floor(Math.random() * 5); // High root + octave + random interval
            const freq = getFrequencyFromDegree(degree, 'melody');
             if (freq) {
                 self.postMessage({
                     type: 'playNote',
                     note: { type: 'autopilot_effect_echoes', freq, dur: '8n', vel: 0.6 },
                     time
                 });
             }
         }
        // Schedule the next effect check
        state.nextEffectTime = time + (Math.random() * 4 + 2); // 2 to 6 seconds
    }

    state.tickCount++;
}

// --- MAIN EVENT HANDLER ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;

    switch (type) {
        case 'start':
            state.tickCount = 0;
            state.nextEffectTime = performance.now() / 1000 + 3; // Schedule first effect
            break;
        case 'stop':
            state.tickCount = 0;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setTempo':
            state.currentBpm = data.bpm;
            break;
        case 'setHarmony':
            state.currentKey = data.key;
            state.currentScale = data.scale;
            state.scaleIntervals = scaleIntervalMap[data.scale] || [];
            state.scaleFrequencies = {
                bass: getScaleFrequenciesForOctaves(data.key, data.scale, data.bassOctaves),
                accompaniment: getScaleFrequenciesForOctaves(data.key, data.scale, data.accompanimentOctaves),
                melody: getScaleFrequenciesForOctaves(data.key, data.scale, data.melodyOctaves),
            };
            // Set a simple, slow chord progression
            state.chordProgression = data.scale.includes('Major') ? [0, 4] : [0, 3]; // I-V or i-iv
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
    }
};
