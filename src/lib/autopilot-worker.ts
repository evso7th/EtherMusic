

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { AutopilotInstrument } from './audio-engine';

// --- TYPE DEFINITIONS ---

type NoteEvent = {
    time: number; // in seconds, relative to the start of the pattern
    freq: number | number[];
    dur: number; // in seconds
    vel: number;
};

type AutopilotPattern = {
    melody: NoteEvent[];
    accompaniment: NoteEvent[];
    bass: NoteEvent[];
    effects: NoteEvent[];
};

// --- WORKER COMMUNICATION INTERFACES ---

export type WorkerEvent =
    | { type: 'generate' }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setTempo', bpm: number };

export type WorkerResponse =
    | { type: 'patternGenerated', pattern: AutopilotPattern };


// --- WORKER STATE ---

let currentKey: MusicKey = 'C';
let currentScale: MusicScale = 'Major Pentatonic';
let currentStyle: AutopilotStyle = 'Ambient';
let currentBpm = 120;
let freqs = {
    bass: [] as number[],
    accompaniment: [] as number[],
    melody: [] as number[],
};

// --- CORE LOGIC ---

function getNoteFrequency(key: MusicKey, octave: number, interval: number): number {
    const A4 = 440;
    const keyMap: {[key in MusicKey]: number} = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}

function getScaleFrequencies(key: MusicKey, scale: MusicScale, octaves: number[]): number[] {
    const scaleIntervals: { [key in MusicScale]: number[] } = {
        'Major': [0, 2, 4, 5, 7, 9, 11], 'Minor': [0, 2, 3, 5, 7, 8, 10],
        'Major Pentatonic': [0, 2, 4, 7, 9], 'Minor Pentatonic': [0, 3, 5, 7, 10],
    };
    
    let allFrequencies: number[] = [];
    const intervals = scaleIntervals[scale];
    
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            allFrequencies.push(getNoteFrequency(key, octave, interval));
        });
    });
    return allFrequencies.sort((a,b) => a - b);
}

function updateFrequencies() {
    freqs = {
        // C1-C3
        bass: getScaleFrequencies(currentKey, currentScale, [1, 2]),
        // C2-C4
        accompaniment: getScaleFrequencies(currentKey, currentScale, [2, 3]),
        // C3-C5
        melody: getScaleFrequencies(currentKey, currentScale, [3, 4]),
    };
}

function durationToSeconds(duration: string, bpm: number): number {
    const quarterNoteDuration = 60 / bpm;
    const match = duration.match(/^(\d+)([ntm])$/);
    if (!match) return quarterNoteDuration / 2; // Default to 8n

    const value = parseInt(match[1]);
    const unit = match[2];

    switch(unit) {
        case 'n':
            if (value === 1) return quarterNoteDuration * 4;
            if (value === 2) return quarterNoteDuration * 2;
            return quarterNoteDuration * (4 / value);
        case 't':
            return (quarterNoteDuration * 4) / (value * 1.5);
        case 'm':
            return value * 4 * quarterNoteDuration;
        default:
            return quarterNoteDuration / 2;
    }
}


function generatePattern() {
    if (freqs.bass.length === 0 || freqs.melody.length === 0) {
        updateFrequencies();
    }
    
    const pattern: AutopilotPattern = { melody: [], accompaniment: [], bass: [], effects: [] };
    const sixteenthNoteDuration = durationToSeconds('16n', currentBpm);

    // Simple generation logic for now
    // Bass: one note per measure
    for (let i = 0; i < 4; i++) {
        pattern.bass.push({
            time: i * durationToSeconds('1m', currentBpm),
            freq: freqs.bass[Math.floor(Math.random() * 3)], // low notes
            dur: durationToSeconds('1m', currentBpm),
            vel: 0.4
        });
    }

    // Accompaniment: simple chords
    for (let i = 0; i < 2; i++) {
        const rootIdx = Math.floor(Math.random() * 4);
        const chord = [freqs.accompaniment[rootIdx], freqs.accompaniment[rootIdx + 2], freqs.accompaniment[rootIdx + 4]];
        pattern.accompaniment.push({
            time: i * durationToSeconds('2m', currentBpm),
            freq: chord,
            dur: durationToSeconds('2m', currentBpm),
            vel: 0.3
        });
    }

    // Melody: a few random notes
    for (let i = 0; i < 8; i++) {
        if (Math.random() > 0.5) {
            pattern.melody.push({
                time: i * durationToSeconds('8n', currentBpm) * 2,
                freq: freqs.melody[Math.floor(Math.random() * freqs.melody.length)],
                dur: durationToSeconds('8n', currentBpm),
                vel: 0.6
            });
        }
    }
    
    // Effects: random noise burst
    if (Math.random() > 0.7) {
        pattern.effects.push({
            time: Math.random() * durationToSeconds('4m', currentBpm),
            freq: 0, // freq doesn't matter for noise synth
            dur: durationToSeconds('16n', currentBpm),
            vel: 1.0
        });
    }


    postMessage({ type: 'patternGenerated', pattern });
}

self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type } = event.data;
    switch (type) {
        case 'generate':
            generatePattern();
            break;
        case 'setHarmony':
            currentKey = event.data.key;
            currentScale = event.data.scale;
            updateFrequencies();
            break;
        case 'setStyle':
            // TODO: Implement style variations in generatePattern
            currentStyle = event.data.style;
            break;
        case 'setTempo':
            currentBpm = event.data.bpm;
            break;
    }
};
