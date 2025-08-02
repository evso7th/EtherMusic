

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { InstrumentType } from './audio-engine';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---

type NoteEvent = {
    type: InstrumentType;
    freq: number | number[]; 
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
const subdivisions = 16; 

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let currentBpm = 120;
let scaleIntervals: number[] = [];
let chordProgression: number[] = [0, 4, 5, 3];

type OctaveConfig = {
    primary: number[];
    rare: number[];
};

let scaleFrequencies: Record<'bass' | 'accompaniment' | 'melody', OctaveConfig> = {
    bass: { primary: [2, 3], rare: [1] },
    accompaniment: { primary: [3], rare: [2, 4] },
    melody: { primary: [3, 4], rare: [5] },
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
    
    for (const part in scaleFrequencies) {
        const key = part as keyof typeof scaleFrequencies;
        const config = scaleFrequencies[key];
        config.primary = getScaleFrequenciesForOctaves(currentKey, currentScale, config.primary);
        config.rare = getScaleFrequenciesForOctaves(currentKey, currentScale, config.rare);
    }

    if (currentScale.includes('Major')) {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
}


function getFrequencyFromDegree(degree: number, part: keyof typeof scaleFrequencies): number {
    const octaves = scaleFrequencies[part];
    const targetFrequencies = Math.random() < 0.15 ? octaves.rare : octaves.primary;
    
    const scaleIndex = degree % scaleIntervals.length;
    const octaveOffset = Math.floor(degree / scaleIntervals.length);
    
    const baseOctaveFreqs = getScaleFrequenciesForOctaves(currentKey, currentScale, [3]); // Use a central octave for reference
    if(baseOctaveFreqs.length === 0) return 440;
    
    const baseFreq = baseOctaveFreqs[scaleIndex];
    const targetFreq = baseFreq * Math.pow(2, octaveOffset);

    // Find the closest frequency in the allowed octaves
    return targetFrequencies.reduce((prev, curr) => (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev));
}


function getChordTones(rootDegree: number, part: keyof typeof scaleFrequencies, count: number): number[] {
    const chordTones: number[] = [];
    for (let i = 0; i < count; i++) {
        const degree = rootDegree + i * 2;
        chordTones.push(getFrequencyFromDegree(degree, part));
    }
    return Array.from(new Set(chordTones));
}


// --- THE "CONDUCTOR" ---
function tick() {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const rootDegree = chordProgression[measure % chordProgression.length];

    // --- Bass ---
    if (beat % 8 === 0) { // Play on the downbeat of every half measure
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.6 } });
    }

    // --- Accompaniment (Arpeggio) with Syncopation ---
    const isAccompanimentTick = (beat + 1) % 2 === 0;
    if (isAccompanimentTick && Math.random() > 0.1) { // Add some rests
        const chordTones = getChordTones(rootDegree, 'accompaniment', 3);
        if (chordTones.length > 0) {
            const arpNoteIndex = Math.floor(beat / 2) % chordTones.length;
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                const isSyncopated = Math.random() < 0.2;
                if (!isSyncopated) {
                     postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.3 } });
                }
            }
        }
    }
    
    // --- Melody (Arpeggio) ---
    if (beat % 4 === 0 && Math.random() < 0.75) {
        const chordTones = getChordTones(rootDegree, 'melody', 5);
        if (chordTones.length > 0) {
            const arpNoteIndex = (Math.floor(beat / 4) + Math.floor(Math.random() * 3)) % chordTones.length;
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                 postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '4n', vel: 0.5 } });
            }
        }
    }

    // --- Effects ---
    if (Math.random() < 0.02) { // Lowered probability
        const freq = getFrequencyFromDegree(Math.floor(Math.random() * 7), 'melody');
        postMessage({ type: 'playNote', note: { type: 'autopilot_effect', freq, dur: '2n', vel: 0.4 } });
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
            updateMusicContext(); // Recalculate frequencies when harmony changes
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

    