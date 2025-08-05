// public/assets/workers/autopilot.worker.js

// Import Tone.js from a CDN or a local copy if you have one.
// Note: Using importScripts is the standard way to load external scripts in a worker.
try {
    importScripts("https://cdnjs.cloudflare.com/ajax/libs/tone/15.0.4/Tone.min.js");
} catch (e) {
    console.error("Failed to import Tone.js into worker:", e);
}


// --- WORKER STATE ---
let isRunning = false;
let tickInterval = null;
let noteIndex = 0;
let scaleNotes = [];
let currentBpm = 90;

// --- MUSIC THEORY & UTILITIES ---
function updateScaleNotes(key, scale) {
    // This is a simplified version. Tone.js is not fully available in the same way,
    // so we'll construct the scale manually for now.
    const scaleIntervals = {
        'Major': [0, 2, 4, 5, 7, 9, 11],
        'Minor': [0, 2, 3, 5, 7, 8, 10],
        'Major Pentatonic': [0, 2, 4, 7, 9],
        'Minor Pentatonic': [0, 3, 5, 7, 10],
    };
    
    // For simplicity, we'll stick to octave 4 for the test
    const octave = 4;
    const baseNote = `${key}${octave}`;
    const intervals = scaleIntervals[scale];

    if (self.Tone && self.Tone.Frequency) {
        scaleNotes = intervals.map(interval => 
            new self.Tone.Frequency(baseNote).transpose(interval).toFrequency()
        );
         // Add the octave higher note to complete the scale
        scaleNotes.push(new self.Tone.Frequency(baseNote).transpose(12).toFrequency());
    } else {
        // Fallback or error if Tone.js is not loaded
        console.error("Tone.js is not available in the worker.");
        scaleNotes = [];
    }
}


// --- CORE LOGIC ---
function tick() {
    if (!isRunning || scaleNotes.length === 0) return;

    const noteToPlayFreq = scaleNotes[noteIndex % scaleNotes.length];
    
    // We now send a frequency, not a note name.
    const noteEvent = {
        freq: noteToPlayFreq,
        dur: '8n',
        vel: 0.8
    };
    
    self.postMessage({ type: 'playNote', note: noteEvent });
    
    noteIndex++;
}


// --- MESSAGE HANDLER ---
self.onmessage = function (event) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            if (isRunning) return;
            isRunning = true;
            noteIndex = 0;
            const intervalMs = (60 / currentBpm) * 1000 / 2; // for 8th notes
            if (tickInterval) clearInterval(tickInterval);
            tickInterval = setInterval(tick, intervalMs);
            break;
        case 'stop':
            if (!isRunning) return;
            isRunning = false;
            if (tickInterval) {
                clearInterval(tickInterval);
                tickInterval = null;
            }
            break;
        case 'setHarmony':
             if ('key' in data && 'scale' in data) {
                updateScaleNotes(data.key, data.scale);
            }
            break;
        case 'setTempo':
            if ('bpm' in data) {
                currentBpm = data.bpm;
                if (isRunning) {
                    if (tickInterval) clearInterval(tickInterval);
                    const newIntervalMs = (60 / currentBpm) * 1000 / 2;
                    tickInterval = setInterval(tick, newIntervalMs);
                }
            }
            break;
    }
};

// Initial setup, assuming Tone.js will be loaded by the time this is needed.
// A more robust solution might wait for a 'ready' message.
setTimeout(() => {
    updateScaleNotes('C', 'Major Pentatonic');
}, 100); // Give Tone.js a moment to load
