
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
        bass: getScaleFrequenciesForOctaves(currentKey, currentScale, [1, 2]), // Limit bass to octaves 1 & 2
        accompaniment: getScaleFrequenciesForOctaves(currentKey, currentScale, [2, 3]), // Accompaniment lower
        melody: getScaleFrequenciesForOctaves(currentKey, currentScale, [3, 4, 5]),
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
    
    // Calculate index within a single octave
    const noteIndexInScale = (degree % scaleLength + scaleLength) % scaleLength;
    
    // Calculate which octave this degree falls into
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
    
    for (let i = 0; i < 3; i++) { // Get 3 notes for a triad (root, 3rd, 5th)
        const degreeIndex = (rootDegree + i * 2) % scaleIntervals.length;
        const octaveOffset = Math.floor((rootDegree + i * 2) / scaleIntervals.length);
        chordTones.push(degreeIndex + octaveOffset * scaleIntervals.length);
    }
    return chordTones;
}


// --- STYLE-SPECIFIC GENERATORS ---
function generateArpeggio(beat: number, chordTonesDegrees: number[], patternLength: number, syncopation: number): number | null {
    if (chordTonesDegrees.length === 0) return null;
    const patternIndex = (beat + syncopation) % patternLength;
    if (patternIndex < chordTonesDegrees.length) {
        return chordTonesDegrees[patternIndex];
    }
    return null;
}

// --- THE "CONDUCTOR" ---
function tick(time: number) {
    const measure = Math.floor(tickCount / subdivisions);
    const beat = tickCount % subdivisions;
    
    const chordIndex = Math.floor(measure / 2) % chordProgression.length;
    const rootDegree = chordProgression[chordIndex];
    const chordToneDegrees = getChordTones(rootDegree);

    // --- Bass ---
    const bassRhythm = [0, 4, 7, 10, 13]; // Syncopated bass rhythm
    if (enabledParts.bass && bassRhythm.includes(beat % 16)) {
        const degreeToPlay = Math.random() < 0.8 ? rootDegree : rootDegree + 2; // Play root or third
        const freq = getFrequencyFromDegree(degreeToPlay, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.8 }, time });
        }
    }

    // --- Accompaniment ---
    if (enabledParts.accompaniment && (beat % 2 === 0)) { // Play on every 8th note
        const degree = generateArpeggio(Math.floor(beat / 2), chordToneDegrees, 4, beat % 4);
        if (degree !== null) {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.5 }, time });
            }
        }
    }

    // --- Melody ---
    const melodyRhythm = [0, 3, 7, 10, 14]; // A sparse rhythm to make it feel like a solo
    if (enabledParts.melody && melodyRhythm.includes(beat % 16)) {
        let nextDegree: number | null = null;
        
        if (lastMelodyDegree !== null) {
            if (Math.random() < 0.7) { // 70% chance to make a step
                const direction = Math.random() < 0.5 ? 1 : -1;
                nextDegree = lastMelodyDegree + direction;
            } else { // 30% chance to make a leap to a chord tone
                nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
            }
        } else {
            nextDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        }

        if (nextDegree !== null) {
            const freq = getFrequencyFromDegree(nextDegree, 'melody');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '4n', vel: 0.7 }, time });
                lastMelodyDegree = nextDegree;
            }
        }
    }

    // --- Effects ---
    if (enabledParts.effects && time >= nextEffectTime) {
        if (Math.random() < 0.3) { // Increased probability
             const randomRootDegree = chordProgression[Math.floor(Math.random() * chordProgression.length)];
             const freq = getFrequencyFromDegree(randomRootDegree, 'melody');
             if (freq) {
                 const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
                 const numNotes = Math.floor(Math.random() * 2) + 2; // 2-3 notes
                 for(let i=0; i < numNotes; i++){
                    const effectFreq = freq * Math.pow(1.05946, i*2); // step up a whole tone
                    self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '8n', vel: Math.random() * 0.3 + 0.2 }, time: time + i * 0.1 });
                 }
             }
        }
        const randomDelay = Math.random() * 2000 + 1000; // 1 to 3 seconds
        nextEffectTime = time + randomDelay;
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
        const drift = self.performance.now() - expected;
        if (drift > intervalSeconds * 1000) {
            // We're too far behind, reset
            console.warn("Autopilot worker drift too high, resetting.");
            expected = self.performance.now();
        }
        
        // Pass the "expected" time to the tick function for scheduling in Tone.js
        tick(expected / 1000); // Convert ms to seconds

        expected += intervalSeconds * 1000;
        timerId = setTimeout(loop, intervalSeconds * 1000 - drift);
    }
    
    nextEffectTime = self.performance.now() + 1000; // Schedule first effect
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
        case 'setStyle':
            currentStyle = event.data.style;
            if (timerId !== null) {
                start();
            }
            break;
        case 'setTempo':
            currentBpm = event.data.bpm;
            if (timerId !== null) { 
                start();
            }
            break;
        case 'setParts':
            enabledParts = event.data.parts;
            break;
    }
};
