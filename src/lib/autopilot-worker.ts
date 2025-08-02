
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentType } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---

type NoteEvent = {
    type: InstrumentType;
    freq: number;
    dur: Unit.Time;
    vel: number;
};

export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setTempo', bpm: number };

export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent };


// --- WORKER STATE ---
let timerId: any = null;
let tickCount = 0;
const subdivisions = 16; // 16th notes per measure

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let currentBpm = 120;
let scaleIntervals: number[] = [];
// A simple but effective chord progression based on scale degrees
let chordProgression: number[] = [0, 4, 5, 3]; // I-V-vi-IV for Major

let scaleFrequencies: Record<'bass' | 'accompaniment' | 'melody', number[]> = {
    bass: [],
    accompaniment: [],
    melody: [],
};


// --- MUSIC THEORY HELPERS ---

const scaleIntervalMap: { [key in MusicScale]: number[] } = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': ['0', '3', '5', '7', '10'].map(Number),
};

function getNoteFrequency(key: MusicKey, octave: number, interval: number): number {
    const A4 = 440;
    const keyMap: {[key in MusicKey]: number} = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}


function getScaleFrequenciesForOctaves(key: MusicKey, scale: MusicScale, octaves: number[]): number[] {
    const intervals = scaleIntervalMap[scale];
    let allFrequencies: number[] = [];
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            allFrequencies.push(getNoteFrequency(key, octave, interval));
        });
    });
    return allFrequencies.sort((a,b) => a - b);
}

// Recalculates all musical context based on current settings
function updateMusicContext() {
    scaleIntervals = scaleIntervalMap[currentScale];
    
    scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(currentKey, currentScale, [2, 3]),
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, [3]),
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, [3, 4, 5]),
    };

    if (currentScale.includes('Major')) {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
}


function getFrequencyFromDegree(degree: number, part: keyof typeof scaleFrequencies): number | null {
    const targetFrequencies = scaleFrequencies[part];
    if (!targetFrequencies || targetFrequencies.length === 0) return null;

    const scaleIndex = degree % scaleIntervals.length;
    const octaveOffset = Math.floor(degree / scaleIntervals.length);
    
    const baseOctaveKey = getScaleFrequenciesForOctaves(currentKey, currentScale, [3]); // Using 3rd octave as a reference
    if(baseOctaveKey.length <= scaleIndex) return null;
    
    const baseFreq = baseOctaveKey[scaleIndex];
    if (baseFreq === null || baseFreq === undefined) return null;

    const targetFreq = baseFreq * Math.pow(2, octaveOffset);

    // Find the closest frequency in the allowed octaves for that part
    return targetFrequencies.reduce((prev, curr) => (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev), targetFrequencies[0] ?? 0);
}


// Gets the frequencies for a triad (root, 3rd, 5th) based on a root degree
function getChordTones(rootDegree: number, part: keyof typeof scaleFrequencies, count: number): number[] {
    const chordTones: number[] = [];
    for (let i = 0; i < count; i++) {
        const degree = rootDegree + i * 2; // Build a triad (root, 3rd, 5th, etc.) from the rootDegree
        const freq = getFrequencyFromDegree(degree, part);
        if (freq) {
            chordTones.push(freq);
        }
    }
    return chordTones;
}


// --- THE "CONDUCTOR" ---
// This function is called for every 16th note.
function tick() {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const rootDegree = chordProgression[measure % chordProgression.length];

    // --- Bass ---
    // Plays a pulsating, rhythmic bass line on the downbeats.
    if (beat % 8 === 0) { // On the 1 and 3 of each measure (if measure is 4/4)
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.6 } });
        }
    }

    // --- Accompaniment (Arpeggio) with Syncopation ---
    // Plays a dense arpeggio to create a harmonic pad.
    const isAccompanimentTick = (beat + 1) % 2 === 0; // Play on off-beats
    if (isAccompanimentTick && Math.random() > 0.1) {
        const chordTones = getChordTones(rootDegree, 'accompaniment', 3);
        if (chordTones.length > 0) {
            const arpNoteIndex = Math.floor(beat / 2) % chordTones.length;
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                // Introduce syncopation: a small chance to play a note slightly off the grid
                const isSyncopated = Math.random() < 0.2;
                if (!isSyncopated) {
                     self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.3 } });
                }
            }
        }
    }
    
    // --- Melody (Solo Phrases) ---
    // Plays a more sparse, but more prominent melodic line.
    if (beat % 4 === 0 && Math.random() < 0.75) {
        const chordTones = getChordTones(rootDegree, 'melody', 5);
        if (chordTones.length > 0) {
            // Pick a random note from the higher parts of the chord to make it more melodic
            const arpNoteIndex = (Math.floor(beat / 4) + Math.floor(Math.random() * 3)) % chordTones.length;
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                 self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '4n', vel: 0.5 } });
            }
        }
    }

    // --- Effects (Falling Stars / Meteors) ---
    // A small chance to play a special effect.
    if (Math.random() < 0.02) {
        // Choose a random high note from the scale
        const randomRoot = scaleIntervals[Math.floor(Math.random() * scaleIntervals.length)];
        const freq = getFrequencyFromDegree(randomRoot, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_effect', freq, dur: '2n', vel: 0.4 } });
        }
    }

    tickCount = (tickCount + 1) % (subdivisions * 4); // Loop over 4 measures
}


function start() {
    stop(); // Ensure no multiple loops are running
    updateMusicContext();
    tickCount = 0;
    const interval = (60 / currentBpm / 4) * 1000; // 16th note interval
    timerId = setInterval(tick, interval);
}

function stop() {
    if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
    }
}


// --- WORKER EVENT HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type } = event.data;
    switch (type) {
        case 'start':
            start();
            break;
        case 'stop':
            stop();
            break;
        case 'setHarmony':
            currentKey = event.data.key;
            currentScale = event.data.scale;
            updateMusicContext();
            break;
        case 'setStyle':
            currentStyle = event.data.style;
            break;
        case 'setTempo':
            currentBpm = event.data.bpm;
            if (timerId !== null) { // If it's already running, restart with new tempo
                start();
            }
            break;
    }
};
