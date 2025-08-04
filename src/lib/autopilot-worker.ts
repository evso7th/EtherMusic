

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentType } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotPart = 'bass' | 'accompaniment' | 'melody' | 'effects';

export type NoteEvent = {
    type: InstrumentType;
    freq: number;
    dur: Unit.Time;
    vel: number;
};

export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale, bassOctaves: number[], melodyOctaves: number[], accompanimentOctaves: number[] }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setTempo', bpm: number }
    | { type: 'setParts', parts: Record<AutopilotPart, boolean> }
    | { type: 'tick', time: number };


export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent, time: number };


// --- WORKER STATE ---
let timerId: any = null;
let tickCount = 0;
const subdivisions = 16; 

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let currentBpm = 120;
let scaleIntervals: number[] = [];
let chordProgression: number[] = [0, 4, 5, 3]; 

let lastMelodyDegree: number | null = null;
let lastAccompanimentDegree: number | null = null;

let enabledParts: Record<AutopilotPart, boolean> = {
    bass: true,
    accompaniment: true,
    melody: true,
    effects: true
};

let scaleFrequencies: Record<'bass' | 'accompaniment' | 'melody', number[]> = {
    bass: [],
    accompaniment: [],
    melody: [],
};

const effectTypes: InstrumentType[] = [
    'autopilot_effect_star', 'autopilot_effect_meteor', 'autopilot_effect_warp', 'autopilot_effect_hole',
    'autopilot_effect_pulsar', 'autopilot_effect_nebula', 'autopilot_effect_comet', 'autopilot_effect_wind', 'autopilot_effect_echoes'
];

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
    if (!intervals) return [];
    let allFrequencies: number[] = [];
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            allFrequencies.push(getNoteFrequency(key, octave, interval));
        });
    });
    return allFrequencies.sort((a,b) => a - b);
}

function updateMusicContext(data: any) {
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
    lastMelodyDegree = null;
    lastAccompanimentDegree = null;
}


function getFrequencyFromDegree(degree: number, part: keyof typeof scaleFrequencies): number | null {
    const freqs = scaleFrequencies[part];
    const scaleLength = scaleIntervals.length;

    if (!freqs || freqs.length === 0 || !scaleLength) return null;
    
    // Correctly handle negative degrees and large degrees with modulo
    const noteIndexInScale = degree >= 0 ? degree % scaleLength : (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }
    // Return null if the calculated index is out of bounds for the available octaves
    return null;
}


function getChordTones(rootDegree: number): number[] {
    const chordTones: number[] = [];
    if (!scaleIntervals.length) return [];
    
    for (let i = 0; i < 3; i++) {
        // Gets the degrees 0, 2, 4 from the rootDegree of the scale
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}


// --- OPTIMIZED STYLE-SPECIFIC GENERATORS ---

//Accompaniment Fill (re-usable and simple)
function generateAccompanimentFill(time: number, beat: number, measure: number, rootDegree: number, chordToneDegrees: number[]) {
    if (measure % 4 !== 3) return; // Only on the 4th measure

    // Simple pattern on quarter notes
    if (beat % 4 === 0) { 
        const pattern = [0, 1, 2, 1]; // indexes of chordToneDegrees
        const noteDegree = chordToneDegrees[pattern[Math.floor(beat/4) % pattern.length]];
        const freq = getFrequencyFromDegree(noteDegree, 'accompaniment');
        if (freq) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.5 }, time });
        }
    }
}

// Melody Improvisation (re-usable and simple)
function generateImprovisation(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
     // Play only on specific beats to create rhythm and pauses. This is much cheaper than running complex logic on every tick.
    const melodyRhythm = [0, 3, 6, 10, 14]; // A simple, syncopated rhythm
    if (!melodyRhythm.includes(beat)) return;

    let nextDegree: number;
    if (lastMelodyDegree === null) {
        nextDegree = chordToneDegrees[0];
    } else {
        // Simple logic: 80% chance to move one step, 20% chance to jump.
        const isStep = Math.random() > 0.2;
        const direction = Math.random() > 0.5 ? 1 : -1;
        const distance = isStep ? 1 : (Math.random() > 0.5 ? 2 : 3); // step or jump of 2 or 3
        nextDegree = lastMelodyDegree + (direction * distance);
    }

    const freq = getFrequencyFromDegree(nextDegree, 'melody');
    
    if (freq) {
        const duration = Math.random() > 0.3 ? '8n' : '4n'; // Rhythmic variety
        self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: duration, vel: 0.7 }, time });
        lastMelodyDegree = nextDegree;
    } else {
        // If we jump out of bounds, reset to a safe note
        lastMelodyDegree = chordToneDegrees[0];
    }
}


function generateEffects(time: number, rootDegree: number, probability = 0.05) {
    if (enabledParts.effects && Math.random() < probability) {
         const freq = getFrequencyFromDegree(rootDegree + 7, 'melody');
         if (freq) {
             const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
             const effectFreq = freq * (Math.random() * 1.5 + 0.5);
             self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '2n', vel: Math.random() * 0.2 + 0.2 }, time });
         }
    }
}

// --- MAIN GENERATOR FUNCTION ---
// This function gets called on every tick and dispatches to the correct style logic.
// The style logic is now much simpler.

function playPattern(time: number, beat: number, pattern: number[], degreeSource: number[], instrument: 'accompaniment' | 'melody', noteType: InstrumentType, duration: Unit.Time, velocity: number) {
    if (pattern.includes(beat)) {
        const noteIndex = pattern.indexOf(beat) % degreeSource.length;
        const degree = degreeSource[noteIndex];
        const freq = getFrequencyFromDegree(degree, instrument);
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: noteType, freq, dur: duration, vel: velocity }, time });
        }
    }
}

function generateMusic(time: number, beat: number, measure: number, rootDegree: number, chordToneDegrees: number[]) {

    // --- SHARED BASS LOGIC (very simple) ---
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
        }
    }

    // --- ACCOMPANIMENT ---
    if (enabledParts.accompaniment && measure % 4 !== 3) {
        let arpPattern: number[] = [];
        switch(currentStyle) {
            case 'Toccata':
            case 'Chimes':
            case 'Sequence':
                arpPattern = [0, 2, 4, 6, 8, 10, 12, 14]; // Fast 16ths
                break;
            case 'Promenade':
            case 'Trance':
                arpPattern = [0, 4, 8, 12]; // Quarter notes
                break;
            case 'Ambient':
            case 'Drone':
            case 'Space':
            default:
                arpPattern = [0, 8]; // Half notes
                break;
        }
        playPattern(time, beat, arpPattern, chordToneDegrees, 'accompaniment', 'autopilot_accompaniment', '8n', 0.5);
    }
    
    // --- FILLS & MELODY ---
    if (enabledParts.accompaniment) {
        generateAccompanimentFill(time, beat, measure, rootDegree, chordToneDegrees);
    }
    if (enabledParts.melody) {
        generateImprovisation(time, beat, rootDegree, chordToneDegrees);
    }

    // --- EFFECTS ---
    generateEffects(time, rootDegree);
}


function tick(time: number) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    generateMusic(time, beat, measure, rootDegree, chordToneDegrees);
    
    tickCount++;
}

function start() {
    stop(); 
    tickCount = 0;
    lastMelodyDegree = null;
    lastAccompanimentDegree = null;
    
    // This uses a precise loop based on performance.now() to avoid drift
    const intervalSeconds = (60 / currentBpm) / (subdivisions / 4); 
    let expected = self.performance.now() + intervalSeconds * 1000;
    
    const loop = () => {
        const drift = self.performance.now() - expected;
        // if (drift > intervalSeconds * 1000) {
        //     // Resync if drift is too high
        //     expected = self.performance.now();
        // }
        
        // Use a fixed time for Tone.js scheduling, not the drifted time
        // This is a placeholder for where the 'tick' would be called from the main thread.
        // The main thread will now be responsible for sending 'tick' messages at the right time.

        expected += intervalSeconds * 1000;
        timerId = setTimeout(loop, Math.max(0, intervalSeconds * 1000 - drift));
    }
    // The loop is no longer started here. It will be driven by 'tick' messages from AutopilotEngine.
}

function stop() {
    if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
    }
}

self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            // start(); // Deprecated: main thread will drive ticks
            tickCount = 0;
            lastMelodyDegree = null;
            break;
        case 'stop':
            // stop(); // Deprecated
            tickCount = 0;
            lastMelodyDegree = null;
            break;
        case 'setHarmony':
            // @ts-ignore
            updateMusicContext(data);
            break;
        case 'setTempo':
            // @ts-ignore
            currentBpm = data.bpm;
            break;
        case 'setParts':
            // @ts-ignore
            enabledParts = data.parts;
            break;
        case 'setStyle':
            // @ts-ignore
            currentStyle = data.style;
            lastMelodyDegree = null;
            lastAccompanimentDegree = null;
            tickCount = 0;
            break;
        case 'tick':
            // This is the new heart of the worker. It only computes when told to.
            // @ts-ignore
            tick(data.time);
            break;
    }
};

    