

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

    // Accompaniment plays a full, soft chord on every half note to create a dense pad
    if (enabledParts.accompaniment && (beat % 8 === 0)) {
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '1n', vel: 0.4 }, time: time + index * 0.02 });
            }
        });
    }
    
    // Melody plays a smooth, continuous line on every quarter note
    if (enabledParts.melody && beat % 4 === 0) {
        let nextDegree: number;
        if (lastMelodyDegree !== null) {
            const direction = Math.random() < 0.5 ? 1 : -1;
            nextDegree = lastMelodyDegree + direction;
        } else {
            nextDegree = chordToneDegrees[0];
        }

        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.6 }, time });
            lastMelodyDegree = nextDegree;
        } else {
            lastMelodyDegree = chordToneDegrees[0];
        }
    }
    generateEffects(time, rootDegree, 0.05);
}

function generateTrance(time: number, beat: number, measure: number, rootDegree: number, chordToneDegrees: number[]) {
    // Wakeman - Journey to the Centre of the Earth
    const cycleLength = 16; 
    const currentCycleMeasure = measure % cycleLength;

    // Bass plays a steady, powerful root note on each beat
    if (enabledParts.bass && beat % 4 === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
    }

    // Accompaniment "descends" by dropping octaves
    if (enabledParts.accompaniment) {
        let octaveOffset = 0;
        if (currentCycleMeasure >= 4 && currentCycleMeasure < 8) octaveOffset = -scaleIntervals.length;
        else if (currentCycleMeasure >= 8 && currentCycleMeasure < 12) octaveOffset = -2 * scaleIntervals.length;
        else if (currentCycleMeasure >= 12) octaveOffset = -3 * scaleIntervals.length;
        
        const arpPattern = [0, 1, 2, 1, 2, 0, 1, 2]; // More complex pattern
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex % chordToneDegrees.length] + octaveOffset;
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
        }
    }
    
    // High, magical melody that stays in the upper octaves
    if (enabledParts.melody && beat % 8 === 0) {
        let nextDegree;
        if (lastMelodyDegree !== null) {
            const direction = Math.random() < 0.5 ? 2 : -1; // Tend to go up
            nextDegree = lastMelodyDegree + direction;
        } else {
            nextDegree = chordToneDegrees[0];
        }

        const melodyOctaveOffset = scaleIntervals.length; // Keep it high
        const freq = getFrequencyFromDegree(nextDegree + melodyOctaveOffset, 'melody');
        
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1n', vel: 0.7 }, time });
            lastMelodyDegree = nextDegree;
        } else {
            lastMelodyDegree = chordToneDegrees[0];
        }
    }
}


function generateToccata(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Bass plays a driving rhythm on 1st and 3rd beats
    if (enabledParts.bass && (beat === 0 || beat === 8)) {
        const degree = beat === 0 ? rootDegree : chordToneDegrees[2]; 
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
    }

    // Accompaniment plays a relentless, non-repeating sequence of chord tones
    if (enabledParts.accompaniment) {
        // Generates a less predictable pattern than a simple arp
        const degree = chordToneDegrees[beat % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.5 }, time });
        }
    }
    
    // Melody is also a fast, continuous stream of notes
    if (enabledParts.melody) {
        let nextDegree: number;
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
    // Bass creates the "walking" rhythm
    if (enabledParts.bass && beat % 4 === 0) {
        const bassPattern = [rootDegree, chordToneDegrees[1], chordToneDegrees[2], chordToneDegrees[1]];
        const degree = bassPattern[Math.floor(beat / 4) % bassPattern.length];
        const freq = getFrequencyFromDegree(degree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '4n', vel: 1.0 }, time });
        }
    }

    // Accompaniment plays powerful, full chords on off-beats to add grandeur
    if (enabledParts.accompaniment && beat % 8 === 4) { 
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '4n', vel: 0.6 }, time: time + index * 0.01 });
            }
        });
    }

    // The melody is stately and follows the harmony
    if (enabledParts.melody && beat % 8 === 0) {
        const melodyPattern = [0, 2, 4, 2];
        const patternIndex = Math.floor(beat / 8) % melodyPattern.length;
        const degree = chordToneDegrees[0] + melodyPattern[patternIndex];
        const freq = getFrequencyFromDegree(degree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '2n', vel: 0.7 }, time });
        }
    }
}

function generateSpace(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Deep, long bass notes
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree - scaleIntervals.length, 'bass'); 
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.9 }, time });
        }
    }

    // Accompaniment plays a slow, pulsing arpeggio
    if (enabledParts.accompaniment) {
        const arpPattern = [0, 0, 1, 1, 2, 2, 1, 1]; // Slow pulse
        const patternIndex = Math.floor(beat/2) % arpPattern.length;
        if (beat % 2 === 0) {
            const degree = chordToneDegrees[patternIndex];
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '8n', vel: 0.6 }, time });
            }
        }
    }

    // Melody is a very long, high, sustained note
    if (enabledParts.melody && beat === 0) {
        const degree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)];
        const freq = getFrequencyFromDegree(degree + scaleIntervals.length, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
        }
    }

    generateEffects(time, rootDegree, 0.25);
}

function generateSequence(time: number, beat: number, measure: number, rootDegree: number, chordToneDegrees: number[]) {
    // Mike Oldfield style
    const cycleMeasure = measure % 16;
    
    // Bass starts first, with a simple riff
    if (enabledParts.bass && (beat === 0 || (cycleMeasure > 4 && beat === 8))) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
    }

    // Accompaniment joins in after 2 measures with a syncopated pattern
    if (enabledParts.accompaniment && cycleMeasure >= 2) {
        // Syncopated rhythm pattern
        let rhythmPattern = [0, 3, 4, 7, 10, 12, 14, 15]; 

        if (rhythmPattern.includes(beat)) {
            const basePattern = [0, 2, 1, 3, 0, 1, 2, 1];
            const noteIndex = rhythmPattern.indexOf(beat) % basePattern.length;
            let degree = chordToneDegrees[basePattern[noteIndex] % chordToneDegrees.length] || rootDegree;
            
            // The pattern evolves after 8 measures
            if (cycleMeasure >= 8) {
                degree += scaleIntervals.length; 
            }

            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.65 }, time });
            }
        }
    }

    // Melody comes in late (after 4 measures) and is also evolutionary
    if (enabledParts.melody && cycleMeasure >= 4) {
        if (beat === 0 && cycleMeasure % 2 === 0) { // Play a long note every 2 measures
             let nextDegree: number;
            if (lastMelodyDegree !== null) {
                const direction = Math.random() < 0.5 ? 1 : -1;
                nextDegree = lastMelodyDegree + direction;
            } else {
                nextDegree = chordToneDegrees[0];
            }
            
            const freq = getFrequencyFromDegree(nextDegree + scaleIntervals.length, 'melody');

            if (freq) {
                self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '1m', vel: 0.7 }, time });
                lastMelodyDegree = nextDegree;
            } else {
                lastMelodyDegree = chordToneDegrees[0];
            }
        }
    }
}


function generateChimes(time: number, beat: number, rootDegree: number, chordToneDegrees: number[]) {
    // Yes - Fragile style
    
    // Accompaniment is a fast, complex, continuous arpeggio
    if (enabledParts.accompaniment) {
        const arpPattern = [0, 2, 1, 3, 0, 3, 1, 2]; // More complex than a simple up/down
        const patternIndex = beat % arpPattern.length;
        const degree = chordToneDegrees[patternIndex % chordToneDegrees.length];
        const freq = getFrequencyFromDegree(degree, 'accompaniment');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_accompaniment', freq, dur: '16n', vel: 0.6 }, time });
        }
    }
    
    // Melody is slower, playing on quarter notes, creating a contrapuntal feel
    if (enabledParts.melody && (beat % 4 === 0)) {
        let nextDegree: number;
        if (lastMelodyDegree !== null) {
             const direction = Math.random() < 0.5 ? 1 : -1;
             const leap = Math.random() < 0.2 ? 2 : 1; // Sometimes leaps
             nextDegree = lastMelodyDegree + (direction * leap);
        } else {
            nextDegree = chordToneDegrees[0];
        }

        const freq = getFrequencyFromDegree(nextDegree, 'melody');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_melody', freq, dur: '4n', vel: 0.8 }, time });
            lastMelodyDegree = nextDegree;
        } else {
             lastMelodyDegree = chordToneDegrees[0];
        }
    }
    // Bass provides a solid, rhythmic foundation
    if (enabledParts.bass && (beat === 0 || beat === 8)) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({ type: 'playNote', note: { type: 'autopilot_bass', freq, dur: '2n', vel: 0.9 }, time });
        }
    }
}


function generateDrone(time: number, beat: number, measure: number, rootDegree: number, chordToneDegrees: number[]) {
    // Pink Floyd style
    
    // Deep, sustained bass root note
    if (enabledParts.bass && beat === 0) {
        const freq = getFrequencyFromDegree(rootDegree, 'bass');
        if (freq) {
            self.postMessage({
                type: 'playNote',
                note: { type: 'autopilot_bass', freq, dur: '1m', vel: 0.7 },
                time
            });
        }
    }

    // Accompaniment is a constantly shifting pad of the chord tones
    if (enabledParts.accompaniment && beat === 0) {
        chordToneDegrees.forEach((degree, index) => {
            const freq = getFrequencyFromDegree(degree, 'accompaniment');
            if (freq) {
                self.postMessage({
                    type: 'playNote',
                    note: {
                        type: 'autopilot_accompaniment',
                        freq,
                        dur: '1m', // Long duration to create overlap
                        vel: 0.4 + (Math.random() * 0.2) // slight variation
                    },
                    time: time + index * 0.02 // slight offset
                });
            }
        });
    }
    
    // More frequent "cosmic" effects
    if (enabledParts.effects && (beat === 4 || beat === 12)) {
         const effectDegree = rootDegree + scaleIntervals.length + 4; 
         const freq = getFrequencyFromDegree(effectDegree, 'melody');
         if(freq) {
            self.postMessage({
                type: 'playNote',
                note: { type: 'autopilot_effect_echoes', freq: freq, dur: '8n', vel: 0.8 },
                time
            });
         }
    }

    // Melody is a single, high, lonely note that appears rarely
    if (enabledParts.melody && beat === 0 && measure % 4 === 0) {
        const melodyDegree = chordToneDegrees[Math.floor(Math.random() * chordToneDegrees.length)] + scaleIntervals.length;
        const freq = getFrequencyFromDegree(melodyDegree, 'melody');
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
            generateTrance(time, beat, measure, rootDegree, chordToneDegrees);
            break;
        case 'Sequence':
            generateSequence(time, beat, measure, rootDegree, chordToneDegrees);
            break;
        case 'Chimes':
            generateChimes(time, beat, rootDegree, chordToneDegrees);
            break;
        case 'Drone':
            generateDrone(time, beat, measure, rootDegree, chordToneDegrees);
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
    lastMelodyDegree = null;
    lastAccompanimentDegree = null;
    
    // This uses a precise loop based on performance.now() to avoid drift
    const intervalSeconds = (60 / currentBpm) / (subdivisions / 4); 
    let expected = self.performance.now() + intervalSeconds * 1000;
    
    const loop = () => {
        const drift = self.performance.now() - expected;
        // if (drift > intervalSeconds * 1000) {
        //     // Resync if drift is too high
        //     expected = self.performance.now();
        // }
        
        // Use a fixed time for Tone.js scheduling, not the drifted time
        tick(expected / 1000); 

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
            if (timerId !== null) { // Restart the loop with the new tempo
                start();
            }
            break;
        case 'setParts':
            // @ts-ignore
            enabledParts = data.parts;
            break;
        case 'setStyle':
            // @ts-ignore
            currentStyle = data.style;
            // Reset state when style changes to avoid weird transitions
            lastMelodyDegree = null;
            lastAccompanimentDegree = null;
            tickCount = 0;
            break;
        case 'tick':
            // The internal timer now drives the tick, so we don't need to handle this message.
            break;
    }
};
