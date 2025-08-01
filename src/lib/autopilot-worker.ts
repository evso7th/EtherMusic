

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';

// --- TYPE DEFINITIONS ---

type NoteEvent = {
    time: number; // in seconds, relative to the start of the pattern
    freq: number; // Note: No longer an array
    dur: number; // in seconds
    vel: number;
};

export type NoteEventWithType = NoteEvent & {
    type: 'melody' | 'accompaniment' | 'bass';
}

type AutopilotPattern = {
    melody: NoteEvent[];
    accompaniment: NoteEvent[];
    bass: NoteEvent[];
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
let scaleIntervals: number[] = [];
let scaleFrequencies = {
    bass: [] as number[],
    accompaniment: [] as number[],
    melody: [] as number[],
};

// --- MUSIC THEORY HELPERS ---

const scaleIntervalMap: { [key in MusicScale]: number[] } = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};

// Chord progressions (degrees of the scale)
const chordProgressions: { [key in MusicScale]?: number[][] } = {
    'Major': [ [0, 4, 5, 3], [0, 3, 4, 0], [0, 4, 1, 5] ], // I-V-vi-IV, I-IV-V-I, I-V-ii-vi
    'Minor': [ [0, 5, 2, 6], [0, 3, 6, 0] ], // i-VI-III-VII, i-iv-VII-i
    'Major Pentatonic': [ [0, 3, 4, 1], [0, 1, 3, 4] ], // More fluid progressions
    'Minor Pentatonic': [ [0, 2, 3, 0], [0, 3, 1, 0] ],
};

function getNoteFrequency(key: MusicKey, octave: number, interval: number): number {
    const A4 = 440;
    const keyMap: {[key in MusicKey]: number} = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    const keyIndex = keyMap[key];
    const midiNote = 12 * (octave + 1) + keyIndex + interval;
    return Math.pow(2, (midiNote - 69) / 12) * A4;
}

function getScaleFrequencies(key: MusicKey, scale: MusicScale, octaves: number[]): number[] {
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
    scaleFrequencies = {
        bass: getScaleFrequencies(currentKey, currentScale, [1, 2]),
        accompaniment: getScaleFrequencies(currentKey, currentScale, [2, 3, 4]),
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

// --- PATTERN GENERATION ---

function generateChordProgression(): number[] {
    const progressions = chordProgressions[currentScale] || chordProgressions['Major']!;
    return progressions[Math.floor(Math.random() * progressions.length)];
}

function generatePattern() {
    if (scaleFrequencies.bass.length === 0) {
        updateMusicContext();
    }
    
    const pattern: AutopilotPattern = { melody: [], accompaniment: [], bass: [] };
    const measureDuration = durationToSeconds('1m', currentBpm);
    const sixteenthNoteDuration = durationToSeconds('16n', currentBpm);
    
    const progression = generateChordProgression();

    for (let measure = 0; measure < 4; measure++) {
        const chordRootDegree = progression[measure];
        
        // --- BASS ---
        const bassNoteIndex = chordRootDegree;
        if (bassNoteIndex < scaleFrequencies.bass.length) {
            const bassFreq = scaleFrequencies.bass[bassNoteIndex];
            let time = measure * measureDuration;
            if (Math.random() < 0.3) { // Syncopation
                time += (Math.random() < 0.5 ? 1 : -1) * sixteenthNoteDuration;
            }
            pattern.bass.push({
                time,
                freq: bassFreq,
                dur: measureDuration * (Math.random() * 0.5 + 0.5),
                vel: 0.5
            });
        }
        
        // --- ACCOMPANIMENT (ARPEGGIO) ---
        const chordToneDegrees = [chordRootDegree, chordRootDegree + 2, chordRootDegree + 4];
        const chordFreqs = chordToneDegrees
            .map(degree => scaleFrequencies.accompaniment[degree % scaleIntervals.length])
            .filter(Boolean); // Filter out undefined if degree is out of bounds

        if (chordFreqs.length > 0) {
            const arpPatterns = [ [0, 1, 2, 1], [0, 2, 1, 0], [0, 1, 0, 2] ];
            const arpPattern = arpPatterns[Math.floor(Math.random() * arpPatterns.length)];
            
            for (let i = 0; i < 4; i++) { // Quarter notes
                const noteIndexInChord = arpPattern[i % arpPattern.length];
                if (noteIndexInChord < chordFreqs.length) {
                    pattern.accompaniment.push({
                        time: measure * measureDuration + i * durationToSeconds('4n', currentBpm),
                        freq: chordFreqs[noteIndexInChord],
                        dur: durationToSeconds('4n', currentBpm),
                        vel: 0.3
                    });
                }
            }
        }
        
        // --- MELODY ---
        for (let i = 0; i < 16; i++) { // 16th note resolution for the whole pattern
            const currentGlobalTime = (measure * 16 + i) * sixteenthNoteDuration;
            if (Math.random() > 0.9) { // Sparser melody
                const melodyFreq = scaleFrequencies.melody[Math.floor(Math.random() * scaleFrequencies.melody.length)];
                let time = currentGlobalTime;
                if (Math.random() < 0.5) { // Syncopation
                    time += (Math.random() - 0.5) * sixteenthNoteDuration * 0.5;
                }
                pattern.melody.push({
                    time,
                    freq: melodyFreq,
                    dur: durationToSeconds('8n', currentBpm) * (Math.random() * 1.5 + 0.5),
                    vel: 0.6
                });
            }
        }
    }
    
    postMessage({ type: 'patternGenerated', pattern });
}

// --- WORKER EVENT HANDLER ---

self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type } = event.data;
    switch (type) {
        case 'generate':
            generatePattern();
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
            break;
    }
};
