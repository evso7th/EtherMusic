

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
    | { type: 'setStyle', style: AutopilotStyle }
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
let currentStyle: AutopilotStyle = 'Ambient';
let currentBpm = 120;
let scaleIntervals: number[] = [];
// A simple but effective chord progression based on scale degrees
let chordProgression: number[] = [0, 4, 5, 3]; // I-V-vi-IV for Major

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
        bass: getScaleFrequenciesForOctaves(currentKey, currentScale, [1, 2]),
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, [2, 3]),
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, [3, 4]),
    };

    if (currentScale.includes('Major')) {
        chordProgression = [0, 4, 5, 3]; // I-V-vi-IV
    } else {
        chordProgression = [0, 5, 3, 6]; // i-VI-IV-VII
    }
}


function getFrequencyFromDegree(degree: number, part: keyof typeof scaleFrequencies): number | null {
    const scale = scaleFrequencies[part];
    const scaleLength = scaleIntervals.length;

    if (!scale || scale.length === 0 || !scaleLength) return null;
    
    // Normalize degree to be within the scale length for indexing
    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    const octaveOffset = Math.floor(degree / scaleLength);

    const baseOctaveNoteIndex = scaleIntervals.indexOf(scaleIntervals[noteIndexInScale]);
    if (baseOctaveNoteIndex === -1) return null;
    
    // Find the base frequency in the first octave of the part's range
    const baseFrequency = scale[baseOctaveNoteIndex];
    if (!baseFrequency) return null;

    // Calculate frequency with octave offset
    return baseFrequency * Math.pow(2, octaveOffset);
}


// Gets the frequencies for a triad (root, 3rd, 5th) based on a root degree
function getChordTones(rootDegree: number, part: keyof typeof scaleFrequencies): number[] {
    const chordTones: number[] = [];
    if (!scaleIntervals.length) return [];
    
    for (let i = 0; i < 3; i++) { // Get 3 notes for a triad
        const degree = rootDegree + i * 2;
        const freq = getFrequencyFromDegree(degree, part);
        if (freq) {
            chordTones.push(freq);
        }
    }
    return chordTones;
}


// --- STYLE-SPECIFIC GENERATORS ---

function generateAmbient(now: number, beat: number, rootDegree: number, measure: number) {
    // Bass: Play a long, sustained root note at the beginning of each chord change (every 2 measures)
    if (enabledParts.bass && measure % 2 === 0 && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2m', vel: 0.6 }, time: now });
        }
    }

    // Accompaniment: Play a full, sustained chord
    if (enabledParts.accompaniment && measure % 2 === 0 && beat === 0) {
        const chordTones = getChordTones(rootDegree, 'accompaniment');
        chordTones.forEach(freq => {
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '2m', vel: 0.5 }, time: now });
            }
        });
    }

    // Melody: Play a single, high, sparse note occasionally
    if (enabledParts.melody && beat === 0 && Math.random() < 0.2) {
        const degree = rootDegree + [0, 2, 4, 7][Math.floor(Math.random() * 4)];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time: now });
        }
    }
}

function generateHouse(now: number, beat: number, rootDegree: number) {
    // Bass: Classic house pattern on the off-beats
    if (enabledParts.bass && (beat % 4 === 2)) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '16n', vel: 0.9 }, time: now });
        }
    }
     // and a syncopated hit
    if (enabledParts.bass && beat === 7 || beat === 15) {
         const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '16n', vel: 0.7 }, time: now });
        }
    }

    // Accompaniment: Pulsing chords on every beat
    if (enabledParts.accompaniment && (beat % 4 === 0)) {
        const chordTones = getChordTones(rootDegree, 'accompaniment');
        chordTones.forEach(freq => {
             if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.5 }, time: now });
            }
        });
    }

    // Melody: More active, short phrases
    if (enabledParts.melody && (beat % 2 === 0) && Math.random() < 0.15) {
         const degree = rootDegree + [0, 2, 4, 5, 7][Math.floor(Math.random() * 5)];
         const freq = getFrequencyFromDegree(degree, 'melody');
         if (freq) {
             self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '8n', vel: 0.8 }, time: now });
         }
    }
}

function generateToccata(now: number, beat: number, rootDegree: number) {
    // Bass: Fast, driving root notes
    if (enabledParts.bass && (beat % 4 === 0 || beat % 4 === 2)) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '8n', vel: 1.0 }, time: now });
        }
    }

    // Accompaniment & Melody (intertwined arpeggios):
    const isAccompanimentTick = (beat % 2 === 0);
    const isMelodyTick = (beat % 2 === 1);

    if (enabledParts.accompaniment && isAccompanimentTick) {
        const chordTones = getChordTones(rootDegree, 'accompaniment');
        if (chordTones.length > 0) {
            const arpNoteIndex = beat % chordTones.length;
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                 self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time: now });
            }
        }
    }
    
    if (enabledParts.melody && isMelodyTick) {
         const chordTones = getChordTones(rootDegree, 'melody');
        if (chordTones.length > 0) {
            const arpNoteIndex = beat % chordTones.length;
            const freq = chordTones[arpNoteIndex];
            if (freq) {
                 self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '16n', vel: 0.8 }, time: now });
            }
        }
    }
}


// --- THE "CONDUCTOR" ---
// This function is called for every 16th note.
function tick() {
    const now = self.performance.now();
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    
    // --- Style-based Generation Router ---
    switch (currentStyle) {
        case 'Ambient':
        case 'Drone':
        case 'Wind':
            generateAmbient(now, beat, rootDegree, measure);
            break;
        case 'House':
        case 'Sequence':
        case 'Chimes':
            generateHouse(now, beat, rootDegree);
            break;
        case 'Toccata':
        case 'Promenade':
        case 'Space': // Space can be dramatic like toccata
             generateToccata(now, beat, rootDegree);
            break;
        default:
            generateAmbient(now, beat, rootDegree, measure); // Fallback style
            break;
    }


    // --- Effects ---
    if (enabledParts.effects && now >= nextEffectTime) {
        const randomRootDegree = scaleIntervals[Math.floor(Math.random() * scaleIntervals.length)];
        const freq = getFrequencyFromDegree(randomRootDegree, 'melody');
        if (freq) {
            const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
            const numberOfNotes = Math.floor(Math.random() * 4) + 2; // 2 to 5 notes per effect
            for(let i = 0; i < numberOfNotes; i++) {
                 self.postMessage({ type: 'playNote', note: { type: effectType, freq: freq * (1 + (Math.random() - 0.5) * 0.1), dur: '1n', vel: Math.random() * 0.3 + 0.2 }, time: now + i * 50 });
            }
            
            const randomDelay = Math.random() * 2000 + 1000; // 1 to 3 seconds
            nextEffectTime = now + randomDelay;
        }
    }

    tickCount++;
}


function start() {
    stop(); // Ensure no multiple loops are running
    updateMusicContext();
    tickCount = 0;
    const interval = (60 / currentBpm) / 4; // 16th note interval in seconds
    let expected = self.performance.now();

    const loop = () => {
        // Calculate drift
        const drift = self.performance.now() - expected;
        // Schedule next tick
        timerId = setTimeout(loop, (interval * 1000) - drift);
        
        tick();

        expected += interval * 1000;
    }
    
    timerId = setTimeout(loop, interval * 1000);
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
        case 'setStyle':
            currentStyle = event.data.style;
            break;
        case 'setTempo':
            currentBpm = event.data.bpm;
            if (timerId !== null) { // If it's already running, restart with new tempo
                start();
            }
            break;
        case 'setParts':
            enabledParts = event.data.parts;
            break;
    }
};

    
