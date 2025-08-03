
// --- State ---
let timerId = null;
let tickCount = 0;
let lastNoteTime = 0;

let state = {
    key: 'D',
    scale: 'Minor',
    bpm: 90,
    parts: { bass: true, accompaniment: true, melody: true, effects: true },
};

const THEME = [
    // Phrase 1
    { degree: 7, dur: '8n', part: 'melody' },
    { degree: 6, dur: '16n', part: 'melody' },
    { degree: 7, dur: '4n', part: 'melody' },
    
    // Phrase 2
    { degree: 4, dur: '8n', part: 'melody' },
    { degree: 3, dur: '16n', part: 'melody' },
    { degree: 4, dur: '4n', part: 'melody' },

    // Phrase 3 (Arpeggio Down)
    { degree: 7, dur: '16n', part: 'melody' },
    { degree: 6, dur: '16n', part: 'melody' },
    { degree: 4, dur: '16n', part: 'melody' },
    { degree: 2, dur: '16n', part: 'melody' },
    { degree: 0, dur: '16n', part: 'melody' },
    { degree: -1, dur: '16n', part: 'melody' },
    { degree: -3, dur: '16n', part: 'melody' },
    { degree: -5, dur: '2n', part: 'melody' },
];

const BASS_LINE = [
    // Holds the D for the first two phrases
    { degree: 0, dur: '1n', startTick: 0 }, 
    // Holds the G for the third phrase
    { degree: 3, dur: '1n', startTick: 8 },
];

const effectTypes = ['autopilot_effect_star', 'autopilot_effect_meteor', 'autopilot_effect_hole', 'autopilot_effect_nebula'];

// --- Music Theory ---
const scaleIntervalMap = {
    'Minor': [0, 2, 3, 5, 7, 8, 10],
};
const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

function getNoteFrequency(octave, interval) {
    const keyIndex = keyMap[state.key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * 440;
}

function getFrequencyFromDegree(degree, part) {
    const intervals = scaleIntervalMap[state.scale];
    if (!intervals) return null;

    const baseOctave = part === 'bass' ? 2 : 4;
    const scaleLength = intervals.length;
    
    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    
    return getNoteFrequency(baseOctave + octaveOffset, intervals[noteIndexInScale]);
}

// --- Worker Logic ---

function tick(time) {
    // --- Bass Line ---
    if (state.parts.bass) {
        const bassNote = BASS_LINE.find(note => note.startTick === tickCount);
        if (bassNote) {
            const freq = getFrequencyFromDegree(bassNote.degree, 'bass');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: bassNote.dur, vel: 0.9 }, time });
            }
        }
    }

    // --- Main Theme ---
    if (state.parts.melody && tickCount < THEME.length) {
        const noteInfo = THEME[tickCount];
        const freq = getFrequencyFromDegree(noteInfo.degree, 'melody');
        if (freq) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: noteInfo.dur, vel: 0.8 }, time });
        }
    }
    
    // --- Effects instead of arpeggios ---
    if (state.parts.effects && Math.random() < 0.4) {
        const effectNoteDegree = THEME[Math.floor(Math.random() * THEME.length)].degree;
        const freq = getFrequencyFromDegree(effectNoteDegree, 'melody');
        if (freq) {
            const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
            self.postMessage({ type: 'playNote', note: { type: effectType, freq: freq * (Math.random() > 0.5 ? 2 : 1), dur: '2n', vel: 0.4 }, time });
        }
    }

    tickCount++;
    if (tickCount >= 16) { // Loop after 4 measures (16 quarter notes)
        tickCount = 0;
    }
}


function start() {
    stop();
    tickCount = 0;
    const intervalSeconds = 60 / state.bpm / 2; // 8th note interval for Bach theme
    lastNoteTime = performance.now();
    
    function loop() {
        const now = performance.now();
        const elapsed = now - lastNoteTime;

        if (elapsed >= intervalSeconds * 1000) {
            tick(now / 1000); // Pass time in seconds
            lastNoteTime = now - (elapsed % (intervalSeconds * 1000));
        }
        timerId = requestAnimationFrame(loop);
    }
    timerId = requestAnimationFrame(loop);
}


function stop() {
    if (timerId) {
        cancelAnimationFrame(timerId);
        timerId = null;
    }
}

// --- Event Listener ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            start();
            break;
        case 'stop':
            stop();
            break;
        case 'setTempo':
            state.bpm = data.bpm;
            if (timerId) start();
            break;
        case 'setHarmony':
            state.key = data.key;
            state.scale = data.scale;
            break;
        case 'setParts':
            state.parts = data.parts;
            break;
    }
};

    