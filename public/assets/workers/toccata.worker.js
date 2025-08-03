// public/assets/workers/toccata.worker.js

// --- STATE ---
let state = {
    tickCount: 0,
    bassOctaves: [2, 3],
    melodyOctaves: [3, 4],
    enabledParts: { bass: true, melody: true, effects: true },
};

// --- MUSIC DATA ---
const melodySequence = [
    { note: "A4", duration: "8n" }, { note: "G4", duration: "16n" }, { note: "A4", duration: "4n" },
    { note: "A3", duration: "8n" },
    { note: "A4", duration: "8n" }, { note: "G4", duration: "16n" }, { note: "A4", duration: "4n" },
    { note: "A3", duration: "8n" },
    { note: "A4", duration: "8n" }, { note: "G4", duration: "16n" }, { note: "A4", duration: "8n" },
    { note: "C5", duration: "8n" }, { note: "B4", duration: "16n" }, { note: "A4", duration: "8n" },
    { note: "G4", duration: "8n" }, { note: "F4", duration: "16n" }, { note: "E4", duration: "4n" },
];

const bassSequence = [
    { note: "A2", duration: "2n" },
    { note: "A2", duration: "2n" },
    { note: "A2", duration: "2n" },
    { note: "D3", duration: "2n" },
];

const effectTypes = [
    'autopilot_effect_star', 'autopilot_effect_nebula', 'autopilot_effect_comet',
];

// --- WORKER LOGIC ---
function tick(time) {
    const subdivisions = 32; // Slower tempo, 32 ticks per measure
    const measure = Math.floor(state.tickCount / subdivisions);
    const beat = state.tickCount % subdivisions;

    // --- Melody ---
    if (state.enabledParts.melody && beat === 0) {
        const step = measure % melodySequence.length;
        const noteInfo = melodySequence[step];
        const noteName = noteInfo.note.slice(0, -1);
        const octave = parseInt(noteInfo.note.slice(-1), 10) - 1; // Lower by one octave
        const freq = getNoteFrequency("D", octave, noteNameToInterval(noteName));
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: noteInfo.duration, vel: 0.7 }, time });
        }
    }

    // --- Bass ---
    if (state.enabledParts.bass && beat === 0) {
        const step = measure % bassSequence.length;
        const noteInfo = bassSequence[step];
        const noteName = noteInfo.note.slice(0, -1);
        const octave = parseInt(noteInfo.note.slice(-1), 10);
        const freq = getNoteFrequency("D", octave, noteNameToInterval(noteName));
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: noteInfo.duration, vel: 0.8 }, time });
        }
    }
    
    // --- Effects ---
    if (state.enabledParts.effects && (beat === 8 || beat === 24)) {
         if (Math.random() < 0.5) { // High probability
             const freq = getNoteFrequency("D", 4, 0); // High D
             if (freq) {
                 const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
                 const effectFreq = freq * (Math.random() > 0.5 ? 1.5 : 0.75); // Add some variation
                 self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '2n', vel: Math.random() * 0.2 + 0.2 }, time });
             }
        }
    }

    state.tickCount++;
}

// --- HELPERS ---
function noteNameToInterval(noteName) {
    const map = { "C": -3, "C#": -2, "D": -1, "D#": 0, "E": 1, "F": 2, "F#": 3, "G": 4, "G#": 5, "A": 6, "A#": 7, "B": 8 };
    return map[noteName] || 0;
}

function getNoteFrequency(key, octave, interval) {
    const A4 = 440;
    const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}

// --- EVENT HANDLER ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            state.tickCount = 0;
            break;
        case 'stop':
            state.tickCount = 0;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setParts':
            state.enabledParts = data.parts;
            break;
    }
};
