
// This file serves as a template for style-specific workers.
// To create a new style, copy this file and rename it (e.g., toccata.worker.ts)
// and then modify the generation logic within the `tick` function.

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentType } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotPart = 'bass' | 'accompaniment' | 'melody' | 'effects';

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
    | { type: 'setStyle', style: AutopilotStyle } // This is kept for potential future use but is managed by engine
    | { type: 'setTempo', bpm: number }
    | { type: 'setParts', parts: Record<AutopilotPart, boolean> };

export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent, time: number };


// --- WORKER STATE ---
let timerId: any = null;
let tickCount = 0;
const subdivisions = 16; // 16th notes per measure

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentBpm = 120;
let scaleIntervals: number[] = [];
let chordProgression: number[] = [0, 4, 5, 3]; // I-V-vi-IV for Major

let lastMelodyDegree: number | null = null;

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

let nextEffectTime = 0;


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

function updateMusicContext() {
    scaleIntervals = scaleIntervalMap[currentScale] || [];
    
    scaleFrequencies = {
        bass: getScaleFrequenciesForOctaves(currentKey, currentScale, [2, 3]),
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, [3, 4]),
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, [4, 5]),
    };

    if (currentScale.includes('Major')) {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
    lastMelodyDegree = null; // Reset melody memory on harmony change
}


function getFrequencyFromDegree(degree: number, part: keyof typeof scaleFrequencies): number | null {
    const freqs = scaleFrequencies[part];
    const scaleLength = scaleIntervals.length;

    if (!freqs || freqs.length === 0 || !scaleLength) return null;
    
    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }

    return null;
}


function getChordTones(rootDegree: number): number[] {
    const chordTones: number[] = [];
    if (!scaleIntervals.length) return [];
    
    for (let i = 0; i < 3; i++) {
        const degreeIndex = (rootDegree + i * 2);
        chordTones.push(degreeIndex);
    }
    return chordTones;
}


// --- STYLE-SPECIFIC GENERATORS ---
function generateArpeggio(beat: number, chordTonesDegrees: number[], patternLength: number, syncopation: number): number | null {
    if (chordTonesDegrees.length === 0) return null;
    const patterns = [
        [0, 1, 2, 1], // up & down
        [0, 2, 1, 2], // spread out
        [2, 1, 0, 1], // down & up
    ];
    const selectedPattern = patterns[Math.floor(beat / 4) % patterns.length];
    const patternIndex = (beat + syncopation) % patternLength;
    const degreeIndex = selectedPattern[patternIndex % selectedPattern.length];

    if (degreeIndex < chordToneDegrees.length) {
        return chordTonesDegrees[degreeIndex];
    }
    return null;
}

// --- THE "CONDUCTOR" ---
// This is the function to modify for each unique style worker
function tick(time: number) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // --- Bass (Ambient Style) ---
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
        }
    }

    // --- Accompaniment (Ambient Style) ---
    if (enabledParts.accompaniment && (beat % 4 === 0)) {
        const degree = generateArpeggio(Math.floor(beat / 2), chordToneDegrees, 4, beat % 4);
        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '2n', vel: 0.5 }, time });
            }
        }
    }

    // --- Melody (Ambient Style) ---
    if (enabledParts.melody && beat % 8 === 1 && Math.random() > 0.4) {
        let nextDegree: number | null = null;
        
        if (lastMelodyDegree !== null) {
            if (Math.random() < 0.8) { // 80% chance to make a step
                const direction = Math.random() < 0.5 ? 1 : -1;
                nextDegree = lastMelodyDegree + direction;
            } else { // 20% chance to make a leap to a chord tone
                nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
            }
        } else {
            nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        }

        if (nextDegree !== null) {
            const freq = getFrequencyFromDegree(nextDegree, 'melody');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1n', vel: 0.6 }, time });
                lastMelodyDegree = nextDegree;
            }
        }
    }

    // --- Effects (Ambient Style) ---
    if (enabledParts.effects && time >= nextEffectTime) {
        if (Math.random() < 0.15) {
             const randomRootDegree = chordProgression[Math.floor(Math.random() * chordProgression.length)];
             const freq = getFrequencyFromDegree(randomRootDegree, 'melody');
             if (freq) {
                 const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
                 const numNotes = Math.floor(Math.random() * 4) + 2;
                 for(let i=0; i < numNotes; i++){
                    const effectFreq = freq * Math.pow(1.05946, i*2 + (Math.random() - 0.5) * 4);
                    self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '4n', vel: Math.random() * 0.2 + 0.3 }, time: time + i * 0.15 });
                 }
             }
        }
        const randomDelay = Math.random() * 5000 + 3000; // 3 to 8 seconds
        nextEffectTime = time + randomDelay / 1000;
    }


    tickCount++;
}


function start() {
    stop(); 
    updateMusicContext();
    tickCount = 0;
    const intervalSeconds = (60 / currentBpm) / 4; // Interval for a 16th note

    let expected = self.performance.now();

    const loop = () => {
        const now = self.performance.now();
        const drift = now - expected;
        if (drift > intervalSeconds * 1000) {
            console.warn("Autopilot worker drift is high. Resetting expected time.");
            expected = now;
        }
        
        tick(expected / 1000); // Pass scheduled time in seconds

        expected += intervalSeconds * 1000;
        timerId = setTimeout(loop, Math.max(0, intervalSeconds * 1000 - drift));
    }
    
    nextEffectTime = self.performance.now() / 1000 + 2; // Schedule first effect 2s from now
    timerId = setTimeout(loop, intervalSeconds * 1000);
}

function stop() {
    if (timerId !== null) {
        clearTimeout(timerId);
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
        case 'setTempo':
            currentBpm = event.data.bpm;
            if (timerId !== null) { 
                start(); // Restart the loop with the new tempo
            }
            break;
        case 'setParts':
            enabledParts = event.data.parts;
            break;
    }
};
