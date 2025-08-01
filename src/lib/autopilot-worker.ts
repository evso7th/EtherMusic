

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
        // C1, C2, C3
        bass: getScaleFrequencies(currentKey, currentScale, [1, 2, 3]),
        // C2, C3, C4
        accompaniment: getScaleFrequencies(currentKey, currentScale, [2, 3, 4]),
        // C3, C4, C5
        melody: getScaleFrequencies(currentKey, currentScale, [3, 4, 5]),
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
    const totalDuration = durationToSeconds('4m', currentBpm);
    const measureDuration = durationToSeconds('1m', currentBpm);

    // Bass: one note per measure
    for (let i = 0; i < 4; i++) {
        // Prefer C2-C3 range, sometimes go to C1
        const bassFreqs = freqs.bass.filter(f => f < 131); // Up to C3
        const freqIndex = Math.random() < 0.2 ? 0 : Math.floor(bassFreqs.length * 0.3) + Math.floor(Math.random() * (bassFreqs.length * 0.7));
        pattern.bass.push({
            time: i * measureDuration,
            freq: bassFreqs[freqIndex],
            dur: measureDuration,
            vel: 0.4
        });
    }

    // Accompaniment: simple chords
    for (let i = 0; i < 4; i++) {
        // Prefer C3 range, with deviations to C2 and C4
        const accompFreqs = freqs.accompaniment;
        const C3_freq = 130.81;
        const C4_freq = 261.63;
        const preferredRange = accompFreqs.filter(f => f >= C3_freq && f < C4_freq);
        
        let rootIdx;
        if (Math.random() < 0.8) {
             rootIdx = Math.floor(Math.random() * preferredRange.length);
        } else {
             rootIdx = Math.floor(Math.random() * (accompFreqs.length - 4));
        }

        const rootFreq = preferredRange[rootIdx] ?? accompFreqs[rootIdx];
        const chordFreqs = [rootFreq];
        const rootNoteIndexInScale = accompFreqs.indexOf(rootFreq);
        if (rootNoteIndexInScale !== -1 && (rootNoteIndexInScale + 2) < accompFreqs.length && (rootNoteIndexInScale + 4) < accompFreqs.length) {
             chordFreqs.push(accompFreqs[rootNoteIndexInScale + 2]);
             chordFreqs.push(accompFreqs[rootNoteIndexInScale + 4]);
        }
       
        if (chordFreqs.length > 1) {
            pattern.accompaniment.push({
                time: i * measureDuration + (measureDuration / 2),
                freq: chordFreqs,
                dur: measureDuration,
                vel: 0.3
            });
        }
    }

    // Melody: a few random notes
    for (let i = 0; i < 8; i++) {
        if (Math.random() > 0.5) {
            const melodyFreqs = freqs.melody.filter(f => f < 524); // Up to C5
            const freq = melodyFreqs[Math.floor(Math.random() * melodyFreqs.length)];
            pattern.melody.push({
                time: i * durationToSeconds('8n', currentBpm) * 2,
                freq: freq,
                dur: durationToSeconds('8n', currentBpm),
                vel: 0.6
            });
        }
    }
    
    // Effects: Increase frequency of random noise bursts
    const numEffects = Math.floor(Math.random() * 4) + 1; // 1 to 4 effects per pattern
    for (let i = 0; i < numEffects; i++) {
        if (Math.random() > 0.3) { // 70% chance to generate an effect
            pattern.effects.push({
                time: Math.random() * totalDuration,
                freq: 0, // freq doesn't matter for noise synth
                dur: durationToSeconds('16n', currentBpm) * (Math.random() * 3 + 1), // variable duration
                vel: 0.8 // a bit louder
            });
        }
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
