

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
    
    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);
    const finalIndex = noteIndexInScale + (octaveOffset * scaleLength);

    if (finalIndex >= 0 && finalIndex < freqs.length) {
        return freqs[finalIndex];
    }
    // Return null if the calculated index is out of bounds
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

function generateEffects(time: number, rootDegree: number, probability = 0.15) {
    if (enabledParts.effects && time >= nextEffectTime && Math.random() < probability) {
         const freq = getFrequencyFromDegree(rootDegree + 7, 'melody');
         if (freq) {
             const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
             const numNotes = Math.floor(Math.random() * 4) + 2;
             for(let i=0; i < numNotes; i++){
                const effectFreq = freq * Math.pow(1.05946, i*2 + (Math.random() - 0.5) * 4);
                self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '4n', vel: Math.random() * 0.2 + 0.3 }, time: time + i * 0.15 });
             }
         }
        const randomDelay = Math.random() * 2000 + 1000;
        nextEffectTime = time + randomDelay / 1000;
    }
}


function generateAmbient(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
        }
    }

    // Accompaniment
    if (enabledParts.accompaniment && (beat % 4 === 0)) {
        const syncopation = (tickCount % 8 === 0) ? 1 : 0;
        const arpPattern = [0, 1, 2, 1];
        const patternIndex = (Math.floor(beat/2) + syncopation) % arpPattern.length;
        const degree = chordToneDegrees[patternIndex];

        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '2n', vel: 0.5 }, time });
            }
        }
    }
    
    // Melody
    if (enabledParts.melody && beat % 2 === 0) { 
        let nextDegree: number | null = null;
        if (lastMelodyDegree !== null) {
            const direction = Math.random() < 0.5 ? 1 : -1;
            const jump = Math.random() < 0.1 ? 2 : 1; 
            nextDegree = lastMelodyDegree + direction * jump;
        } else {
            nextDegree = chordToneDegrees[0];
        }

        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '4n', vel: 0.6 }, time });
            lastMelodyDegree = nextDegree;
        } else {
            lastMelodyDegree = chordToneDegrees[0];
        }
    }

    generateEffects(time, rootDegree);
}

function generateTrance(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass on the downbeat
    if (enabledParts.bass && beat % 4 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
    }

    // Standard 16th note arpeggio for accompaniment
    if (enabledParts.accompaniment) {
        const arpPattern = [0, 1, 2, 1]; // Simple up-down arp
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
        }
    }
    
    // Melody plays a longer note on the first beat of the measure
    if (enabledParts.melody && beat === 0) {
        const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
        }
    }
}


function generateToccata(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    if (enabledParts.bass && beat % 8 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
    }

    if (enabledParts.accompaniment && (beat % 2 === 0)) {
        const arpPattern = [0, 1, 2, 0, 2, 1, 0, 2];
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.5 }, time });
        }
    }
    
    if (enabledParts.melody) {
        let nextDegree: number | null = null;
        if (lastMelodyDegree !== null) {
            const direction = Math.random() < 0.6 ? 1 : -1;
            nextDegree = lastMelodyDegree + direction;
        } else {
            nextDegree = chordToneDegrees[0];
        }

        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '16n', vel: 0.7 }, time });
            lastMelodyDegree = nextDegree;
        } else {
            lastMelodyDegree = chordToneDegrees[0];
        }
    }
}

function generatePromenade(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    if (enabledParts.bass && (beat % 8 === 0 || beat % 8 === 4)) {
        const degree = (beat % 8 === 0) ? rootDegree : chordToneDegrees[1];
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
    }

    if (enabledParts.accompaniment && beat % 4 === 0) {
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.6 }, time: time + index * 0.01 });
            }
        });
    }

    if (enabledParts.melody && beat % 2 === 0) {
        const melodyPattern = [0, 1, 2, 1, 0, 1, 2, 1];
        const patternIndex = Math.floor(beat / 2) % melodyPattern.length;
        const degree = chordToneDegrees[melodyPattern[patternIndex % chordToneDegrees.length]];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '8n', vel: 0.7 }, time });
        }
    }
}

function generateSpace(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
        }
    }

    if (enabledParts.accompaniment && (beat % 8 === 0)) {
        let nextDegree: number | null = null;
        if (lastAccompanimentDegree !== null) {
            nextDegree = lastAccompanimentDegree + (Math.random() < 0.5 ? 1 : -1);
        } else {
            nextDegree = chordToneDegrees[0];
        }
        
        const freq = getFrequencyFromDegree(nextDegree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '2n', vel: 0.6 }, time });
            lastAccompanimentDegree = nextDegree;
        } else {
            lastAccompanimentDegree = chordToneDegrees[0];
        }
    }

    if (enabledParts.melody && beat % 16 === 0) {
        const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
        }
    }

    generateEffects(time, rootDegree, 0.4);
}


function tick(time: number) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    switch (currentStyle) {
        case 'Toccata':
            generateToccata(time, beat, rootDegree, chordToneDegrees);
            break;
        case 'Promenade':
            generatePromenade(time, beat, rootDegree, chordToneDegrees);
            break;
        case 'Space':
            generateSpace(time, beat, rootDegree, chordToneDegrees);
            break;
        case 'Trance':
            generateTrance(time, beat, rootDegree, chordToneDegrees);
            break;
        case 'Ambient':
        case 'Sequence':
        case 'Chimes':
        case 'Drone':
        default:
            generateAmbient(time, beat, rootDegree, chordToneDegrees);
            break;
    }

    tickCount++;
}


function start() {
    stop(); 
    tickCount = 0;
    lastMelodyDegree = null; // Reset last note on start
    lastAccompanimentDegree = null;
    const intervalSeconds = (60 / currentBpm) / (subdivisions / 4); // Interval for a 16th note

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
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            start();
            break;
        case 'stop':
            stop();
            break;
        case 'setHarmony':
             // @ts-ignore
            updateMusicContext(data);
            break;
        case 'setTempo':
             // @ts-ignore
            currentBpm = data.bpm;
            if (timerId !== null) { 
                start(); // Restart the loop with the new tempo
            }
            break;
        case 'setParts':
             // @ts-ignore
            enabledParts = data.parts;
            break;
        case 'setStyle':
             // @ts-ignore
            currentStyle = data.style;
            // When style changes, reset the music state to avoid weird transitions
            lastMelodyDegree = null;
            lastAccompanimentDegree = null;
            tickCount = 0;
            break;
        case 'tick':
             // This case is no longer used as the worker runs its own loop
            break;
    }
};
