

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { AutopilotInstrument } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---

type NoteEvent = {
    type: AutopilotInstrument;
    freq: number | number[]; // Note: Can be an array for chords
    dur: Unit.Time; // Use Tone's Time unit for flexibility
    vel: number;
};

// --- WORKER COMMUNICATION INTERFACES ---

export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setTempo', bpm: number };

export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent };


// --- WORKER STATE ---
let timerId: number | null = null;
let tickCount = 0;
const subdivisions = 16; // 16th note resolution

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let currentBpm = 120;
let scaleIntervals: number[] = [];
let chordProgression: number[] = [0, 4, 5, 3]; // Example progression (I-V-vi-IV in major)

type OctaveConfig = {
    primary: number[];
    rare: number[];
};

let scaleFrequencies: Record<'bass' | 'accompaniment' | 'melody', { primary: number[], rare: number[] }> = {
    bass: { primary: [], rare: [] },
    accompaniment: { primary: [], rare: [] },
    melody: { primary: [], rare: [] },
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

function updateMusicContext() {
    scaleIntervals = scaleIntervalMap[currentScale];
    
    const octaveMap: Record<keyof typeof scaleFrequencies, OctaveConfig> = {
        bass: { primary: [2, 3], rare: [1] },
        accompaniment: { primary: [3], rare: [2, 4] },
        melody: { primary: [3, 4], rare: [5] },
    };

    for (const part in octaveMap) {
        const key = part as keyof typeof scaleFrequencies;
        scaleFrequencies[key] = {
            primary: getScaleFrequenciesForOctaves(currentKey, currentScale, octaveMap[key].primary),
            rare: getScaleFrequenciesForOctaves(currentKey, currentScale, octaveMap[key].rare),
        };
    }

    if (currentScale === 'Major' || currentScale === 'Major Pentatonic') {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
}

function getFrequencyForPart(part: keyof typeof scaleFrequencies, degree: number): number | null {
    const partFrequencies = scaleFrequencies[part];
    if (!partFrequencies || partFrequencies.primary.length === 0) return null;

    const useRare = Math.random() < 0.15;
    const availableFrequencies = (useRare && partFrequencies.rare.length > 0) 
        ? partFrequencies.rare 
        : partFrequencies.primary;

    if (availableFrequencies.length === 0) return null;

    const safeDegree = degree % scaleIntervals.length;
    const targetInterval = scaleIntervals[safeDegree];
    const rootFreqOfNote = getNoteFrequency(currentKey, 0, targetInterval);
    
    let closestFreq = availableFrequencies[0];
    let minDiff = Infinity;
    
    for (const freq of availableFrequencies) {
         const diff = Math.abs( (12 * Math.log2(freq/rootFreqOfNote)) % 12 );
         const roundedDiff = Math.min(diff, 12 - diff);
         if (roundedDiff < minDiff) {
            minDiff = roundedDiff;
            closestFreq = freq;
        }
    }
    return closestFreq;
}

function getChordTones(rootDegree: number, part: keyof typeof scaleFrequencies, count: number): number[] {
    const chordTones: number[] = [];
    for (let i = 0; i < count; i++) {
        const degree = rootDegree + i * 2;
        const freq = getFrequencyForPart(part, degree);
        if (freq) {
            chordTones.push(freq);
        }
    }
    return Array.from(new Set(chordTones)); // Return unique frequencies
}


// --- THE "CONDUCTOR" ---

function tick() {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const rootDegree = chordProgression[measure % chordProgression.length];

    // --- Bass ---
    if (beat === 0) { // Play on the downbeat of the measure
        const freq = getFrequencyForPart('bass', rootDegree);
        if (freq) {
            postMessage({ type: 'playNote', note: { type: 'bass', freq, dur: '1m', vel: 0.6 } });
        }
    }

    // --- Accompaniment (Arpeggio) ---
    if (beat % 2 === 0) { // Eighth note rhythm
        const chordTones = getChordTones(rootDegree, 'accompaniment', 3);
        if (chordTones.length > 0) {
            const arpNoteIndex = (beat / 2) % chordTones.length;
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                 postMessage({ type: 'playNote', note: { type: 'accompaniment', freq, dur: '8n', vel: 0.3 } });
            }
        }
    }
    
    // --- Melody (Arpeggio) ---
    if (beat % 4 === 0) { // Quarter note rhythm for melody
        const chordTones = getChordTones(rootDegree, 'melody', 3);
        if (chordTones.length > 0) {
            const arpNoteIndex = (beat / 4 + 1) % chordTones.length; // Offset from accompaniment
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                 postMessage({ type: 'playNote', note: { type: 'melody', freq, dur: '4n', vel: 0.5 } });
            }
        }
    }

    // --- Effects ---
    if (Math.random() < 0.05) { // Low chance on any tick
        const freq = getFrequencyForPart('melody', Math.floor(Math.random() * 7));
        if (freq) {
            postMessage({ type: 'playNote', note: { type: 'effect', freq, dur: '2n', vel: 0.4 } });
        }
    }

    tickCount++;
    if (tickCount >= subdivisions * 4) {
        tickCount = 0; // Reset after 4 measures
    }
}


function start() {
    stop(); // Ensure no multiple loops are running
    updateMusicContext();
    tickCount = 0;
    const interval = (60 / currentBpm) * (4 / subdivisions) * 1000;
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
            // Potentially change chord progressions or rhythms based on style
            break;
        case 'setTempo':
            currentBpm = event.data.bpm;
            // If the clock is running, restart it to apply the new tempo
            if (timerId !== null) {
                start();
            }
            break;
    }
};
