

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

// Helper to get a frequency from the correct octave based on probability
function getFrequencyForPart(part: keyof typeof scaleFrequencies): number | null {
    const partFrequencies = scaleFrequencies[part];
    const useRare = Math.random() < 0.15; // 15% chance to use a rare octave

    const availableFrequencies = (useRare && partFrequencies.rare.length > 0) 
        ? partFrequencies.rare 
        : partFrequencies.primary;

    if (availableFrequencies.length === 0) return null;
    
    return availableFrequencies[Math.floor(Math.random() * availableFrequencies.length)];
}

function getChordTones(rootDegree: number, part: keyof typeof scaleFrequencies): number[] {
    const octaveSet = (Math.random() < 0.15 && scaleFrequencies[part].rare.length > 0)
        ? scaleFrequencies[part].rare
        : scaleFrequencies[part].primary;
    
    const chordToneDegrees = [rootDegree, rootDegree + 2, rootDegree + 4];
    return chordToneDegrees
        .map(degree => octaveSet[degree % scaleIntervals.length])
        .filter(Boolean); // Filter out undefined if degree is out of bounds
}


// --- PATTERN GENERATION ---

function generateChordProgression(): number[] {
    const progressions = chordProgressions[currentScale] || chordProgressions['Major']!;
    return progressions[Math.floor(Math.random() * progressions.length)];
}

function generatePattern() {
    if (scaleFrequencies.bass.primary.length === 0) {
        updateMusicContext();
    }
    
    const pattern: AutopilotPattern = { melody: [], accompaniment: [], bass: [] };
    const measureDuration = durationToSeconds('1m', currentBpm);
    const sixteenthNoteDuration = durationToSeconds('16n', currentBpm);
    const eighthNoteDuration = durationToSeconds('8n', currentBpm);
    
    const progression = generateChordProgression();

    for (let measure = 0; measure < 4; measure++) {
        const measureStartTime = measure * measureDuration;
        const chordRootDegree = progression[measure];
        
        // --- BASS (Arpeggios & Pulsations) ---
        const bassChordTones = getChordTones(chordRootDegree, 'bass');
        if (bassChordTones.length > 0) {
             const bassRhythms = [
                [0, 2, 4, 6], // steady eighths
                [0, 3, 4, 7], // dotted
                [0, 4],       // half notes
                [0, 2, 4, 5, 6, 7] // syncopated
            ];
            const bassRhythm = bassRhythms[Math.floor(Math.random() * bassRhythms.length)];
            const bassArp = [0, 1, 2, 1]; // Root, Third, Fifth, Third

            bassRhythm.forEach(beat => {
                const arpIndex = bassArp[Math.floor(Math.random() * bassArp.length)];
                const freq = bassChordTones[arpIndex % bassChordTones.length];
                if (freq) {
                    let time = measureStartTime + beat * eighthNoteDuration;
                     if (Math.random() < 0.3) { // Syncopation
                        time += (Math.random() < 0.5 ? 1 : -1) * sixteenthNoteDuration * 0.5;
                    }
                    pattern.bass.push({
                        time: time,
                        freq: freq,
                        dur: eighthNoteDuration,
                        vel: 0.6
                    });
                }
            });
        }
        
        // --- ACCOMPANIMENT (ARPEGGIO) ---
        const accompanimentChordTones = getChordTones(chordRootDegree, 'accompaniment');

        if (accompanimentChordTones.length > 0) {
            const arpPatterns = [ [0, 1, 2, 1], [0, 2, 1, 0], [0, 1, 0, 2] ];
            const arpPattern = arpPatterns[Math.floor(Math.random() * arpPatterns.length)];
            
            for (let i = 0; i < 4; i++) { // Quarter notes
                const noteIndexInChord = arpPattern[i % arpPattern.length];
                if (noteIndexInChord < accompanimentChordTones.length) {
                    pattern.accompaniment.push({
                        time: measureStartTime + i * durationToSeconds('4n', currentBpm),
                        freq: accompanimentChordTones[noteIndexInChord],
                        dur: durationToSeconds('4n', currentBpm),
                        vel: 0.3
                    });
                }
            }
        }
        
        // --- MELODY ---
        for (let i = 0; i < 16; i++) { // 16th note resolution for the whole pattern
            const currentGlobalTime = measureStartTime + i * sixteenthNoteDuration;
            if (Math.random() > 0.9) { // Sparser melody
                const melodyFreq = getFrequencyForPart('melody');
                if (melodyFreq) {
                    let time = currentGlobalTime;
                    if (Math.random() < 0.5) { // Syncopation
                        time += (Math.random() - 0.5) * sixteenthNoteDuration * 0.5;
                    }
                    pattern.melody.push({
                        time,
                        freq: melodyFreq,
                        dur: eighthNoteDuration * (Math.random() * 1.5 + 0.5),
                        vel: 0.6
                    });
                }
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
