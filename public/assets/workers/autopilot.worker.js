
// --- STATE ---
let isRunning = false;
let tickInterval = null;
let noteIndex = 0;
let scaleNotes = [];
let currentBpm = 90;
let currentKey = 'C';
let currentScale = 'Major';

// --- MUSIC THEORY ---
const scaleIntervals = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};

function getNoteName(key, octave, interval) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keyIndex = noteNames.indexOf(key);
    const noteIndex = (keyIndex + interval) % 12;
    return noteNames[noteIndex] + octave;
}

function updateScaleNotes() {
    const intervals = scaleIntervals[currentScale] || scaleIntervals['Major'];
    const notes = [];
    const octaves = [4, 5]; 
    for (const octave of octaves) {
        for (const interval of intervals) {
            notes.push(getNoteName(currentKey, octave, interval));
        }
    }
    // Simple C Major scale for now as a fallback
    scaleNotes = notes.length > 0 ? notes : ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
}


// --- CORE LOGIC ---
function tick() {
    if (!isRunning || scaleNotes.length === 0) return;

    // The worker sends the note name, the main thread will convert to freq and schedule
    const noteToPlay = scaleNotes[noteIndex % scaleNotes.length];
    
    // The worker only needs to provide the note info.
    // The main thread's AudioEngine will handle the absolute timing with Tone.now()
    const noteEvent = {
        freq: noteToPlay,
        dur: '8n', // Note duration
        vel: 0.8,
        time: 0, // This will be replaced by main thread
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
            // Interval for 8th notes based on BPM
            const intervalMs = (60 / currentBpm) * 1000 / 2; 
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
            currentKey = data.key;
            currentScale = data.scale;
            updateScaleNotes();
            break;
        case 'setTempo':
            currentBpm = data.bpm;
            // If running, restart the interval with the new tempo
            if (isRunning) {
                if (tickInterval) clearInterval(tickInterval);
                const newIntervalMs = (60 / currentBpm) * 1000 / 2;
                tickInterval = setInterval(tick, newIntervalMs);
            }
            break;
    }
};

// Initial setup
updateScaleNotes();
