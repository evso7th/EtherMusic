

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

function generateEffects(time: number, rootDegree: number, probability = 0.1) {
    if (enabledParts.effects && Math.random() < probability) {
         const freq = getFrequencyFromDegree(rootDegree + 7, 'melody');
         if (freq) {
             const effectType = effectTypes[Math.floor(Math.random() * effectTypes.length)];
             const numNotes = Math.floor(Math.random() * 4) + 2;
             for(let i=0; i < numNotes; i++){
                const effectFreq = freq * Math.pow(1.05946, i*2 + (Math.random() - 0.5) * 4);
                self.postMessage({ type: 'playNote', note: { type: effectType, freq: effectFreq, dur: '4n', vel: Math.random() * 0.2 + 0.3 }, time: time + i * 0.15 });
             }
         }
    }
}


function generateAmbient(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass holds the root note for the whole measure
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.8 }, time });
        }
    }

    // Accompaniment plays a chord tone on every half note
    if (enabledParts.accompaniment && (beat % 8 === 0)) {
        const degree = chordToneDegrees[Math.floor(beat / 8) % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '2n', vel: 0.5 }, time });
        }
    }
    
    // Melody plays a smooth, continuous line on every quarter note
    if (enabledParts.melody && beat % 4 === 0) {
        let nextDegree: number;
        if (lastMelodyDegree !== null) {
            // Stepwise motion
            const direction = Math.random() < 0.5 ? 1 : -1;
            nextDegree = lastMelodyDegree + direction;
        } else {
            // Start on a chord tone
            nextDegree = chordToneDegrees[0];
        }

        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.6 }, time });
            lastMelodyDegree = nextDegree;
        } else {
            // Reset if out of range
            lastMelodyDegree = chordToneDegrees[0];
        }
    }
    generateEffects(time, rootDegree, 0.05);
}

function generateTrance(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass on the downbeat of every quarter note
    if (enabledParts.bass && beat % 4 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
    }

    // A classic 16th note arpeggio for accompaniment, plays continuously
    if (enabledParts.accompaniment) {
        const arpPattern = [0, 1, 2, 1]; // Simple up-down arp
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
        }
    }
    
    // Melody plays a longer, soaring note on the first beat of the measure
    if (enabledParts.melody && beat === 0) {
        const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
        }
    }
}


function generateToccata(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass plays a more active role, hitting on 1st and 3rd beats
    if (enabledParts.bass && (beat === 0 || beat === 8)) {
        const degree = beat === 0 ? rootDegree : chordToneDegrees[2]; // Root then 5th
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
    }

    // Accompaniment plays a fast, continuous broken chord pattern
    if (enabledParts.accompaniment) {
        const arpPattern = [0, 1, 2, 0, 2, 1, 0, 2, 1, 0, 2, 1, 2, 0, 1, 0];
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.5 }, time });
        }
    }
    
    // Melody plays a continuous stream of notes, creating a virtuosic feel
    if (enabledParts.melody) {
        let nextDegree: number;
        if (lastMelodyDegree !== null) {
            const direction = Math.random() < 0.6 ? 1 : -1; // Tend to go up
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
    // Bass walks on quarter notes
    if (enabledParts.bass && beat % 4 === 0) {
        const bassPattern = [rootDegree, chordToneDegrees[1], chordToneDegrees[2], chordToneDegrees[1]];
        const degree = bassPattern[Math.floor(beat / 4) % bassPattern.length];
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
    }

    // Accompaniment plays full chords on the off-beats, creating the "walking" rhythm
    if (enabledParts.accompaniment && beat % 8 === 4) { // On the 3rd beat of every 2
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.6 }, time: time + index * 0.01 });
            }
        });
    }

    // Melody is stately and follows the harmony on half notes
    if (enabledParts.melody && beat % 8 === 0) {
        const melodyPattern = [0, 1, 2, 1];
        const patternIndex = Math.floor(beat / 8) % melodyPattern.length;
        const degree = chordToneDegrees[patternIndex % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.7 }, time });
        }
    }
}

function generateSpace(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass holds a very long, deep root note
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree - scaleIntervals.length, 'bass'); // One octave lower
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.9 }, time });
        }
    }

    // Slow, pulsing 16th-note arpeggio
    if (enabledParts.accompaniment) {
        const arpPattern = [0, 0, 1, 1, 2, 2, 1, 1]; // Slow pulse
        const patternIndex = Math.floor(beat/2) % arpPattern.length;
        const degree = chordToneDegrees[patternIndex];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.6 }, time });
        }
    }

    // Sparse, long melody note
    if (enabledParts.melody && beat === 0) {
        const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
        }
    }

    generateEffects(time, rootDegree, 0.25); // More frequent effects for space
}

function generateSequence(time: number, beat: number, measure: number, rootDegree: number, chordToneDegrees: number[]) {
    // --- Mike Oldfield - Tubular Bells inspired sequence ---
    const cycleMeasure = measure % 16;

    // --- BASS ---
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.9 }, time });
        }
    }

    // --- ACCOMPANIMENT (The main sequence with syncopation) ---
    if (enabledParts.accompaniment && cycleMeasure >= 2) {
        const melodyPattern = [0, 2, 1, 2, 0, 1, 2, 0];
        let complexMelodyPattern = [0, 2, 1, 3, 0, 1, 2, 1];
        
        // A classic syncopated rhythm pattern (on 16th note basis)
        const rhythmPattern = [0, 3, 4, 7, 10, 12, 14];
        
        if (rhythmPattern.includes(beat)) {
            const pattern = cycleMeasure >= 8 ? complexMelodyPattern : melodyPattern;
            // Get the note degree from the melody pattern based on which rhythmic beat we are on
            const noteIndex = rhythmPattern.indexOf(beat) % pattern.length;
            const degree = chordToneDegrees[pattern[noteIndex] % chordToneDegrees.length] || rootDegree;
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                // Use a shorter note duration to emphasize the syncopation
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.65 }, time });
            }
        }
    }

    // --- MELODY ---
    if (enabledParts.melody && cycleMeasure >= 4) {
        if (beat === 0 && cycleMeasure % 2 === 0) {
            let nextDegree: number;
            if (lastMelodyDegree !== null) {
                const direction = Math.random() < 0.5 ? 1 : -1;
                nextDegree = lastMelodyDegree + direction;
            } else {
                nextDegree = chordToneDegrees[0];
            }
            
            const freq = getFrequencyFromDegree(nextDegree + scaleIntervals.length, 'melody');

            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2m', vel: 0.7 }, time });
                lastMelodyDegree = nextDegree;
            } else {
                lastMelodyDegree = chordToneDegrees[0];
            }
        }
    }
}


function generateChimes(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass holds a long, low root note
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.7 }, time });
        }
    }
    
    // Melody and Accompaniment create a "rain" of notes
    if (enabledParts.melody && beat % 2 === 0) { // Play on every 8th note
        const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        const freq = getFrequencyFromDegree(degree + scaleIntervals.length, 'melody'); // Play one octave higher
        if (freq) {
            self.postMessage({
                type: 'playNote',
                note: {
                    type: 'autopilot_melody',
                    freq,
                    dur: '2n', // Long duration for overlapping sounds
                    vel: Math.random() * 0.4 + 0.3 // Random velocity
                },
                time
            });
        }
    }
}

function generateDrone(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass and accompaniment play the full chord with a long attack and release
    if (enabledParts.bass && beat === 0) {
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'bass'); // Use bass range for all drone notes
            if (freq) {
                self.postMessage({
                    type: 'playNote',
                    note: {
                        type: index === 0 ? 'autopilot_bass' : 'autopilot_accompaniment',
                        freq,
                        dur: '1m', // Very long duration
                        vel: 0.6
                    },
                    time: time + index * 0.05 // Slightly stagger notes
                });
            }
        });
    }

    // Melody plays a very sparse, high, and long note
    if (enabledParts.melody && beat === 0 && Math.random() < 0.4) {
        const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        const freq = getFrequencyFromDegree(degree + scaleIntervals.length * 2, 'melody'); // Play two octaves higher
        if (freq) {
             self.postMessage({
                type: 'playNote',
                note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 },
                time
            });
        }
    }
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
        case 'Sequence':
            generateSequence(time, beat, measure, rootDegree, chordToneDegrees);
            break;
        case 'Chimes':
            generateChimes(time, beat, rootDegree, chordToneDegrees);
            break;
        case 'Drone':
            generateDrone(time, beat, rootDegree, chordToneDegrees);
            break;
        case 'Ambient':
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
        
        // Pass the absolute time for scheduling in Tone.js
        tick(now / 1000); 

        expected += intervalSeconds * 1000;
        timerId = setTimeout(loop, Math.max(0, intervalSeconds * 1000 - drift));
    }
    
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

    
