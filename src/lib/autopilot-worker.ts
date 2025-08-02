

import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';

// --- TYPE DEFINITIONS ---

type NoteEvent = {
    time: number; // in seconds, relative to the start of the pattern
    freq: number | number[]; // Note: Can be an array for chords
    dur: number; // in seconds
    vel: number;
};

export type NoteEventWithType = NoteEvent & {
    type: 'melody' | 'accompaniment' | 'bass' | 'effect';
}

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

function getFrequencyForPart(part: keyof typeof scaleFrequencies, degree?: number): number | null {
    const partFrequencies = scaleFrequencies[part];
    if (!partFrequencies || partFrequencies.primary.length === 0) return null;

    const useRare = Math.random() < 0.15; // 15% chance to use a rare octave

    const availableFrequencies = (useRare && partFrequencies.rare.length > 0) 
        ? partFrequencies.rare 
        : partFrequencies.primary;

    if (availableFrequencies.length === 0) return null;

    if (degree !== undefined) {
        // Ensure degree is within the bounds of scaleIntervals
        const safeDegree = degree % scaleIntervals.length;
        const targetInterval = scaleIntervals[safeDegree];
        // Find the corresponding frequency in the chosen octave set
        const rootFreq = getNoteFrequency(currentKey, 0, targetInterval); // get base frequency
        
        // Find the closest match in the available frequencies
        let closestFreq = availableFrequencies[0];
        let minDiff = Infinity;

        for (const freq of availableFrequencies) {
            // Compare pitch classes (modulo 12) to find the same note in the target octave
             const diff = Math.abs( (12 * Math.log2(freq/rootFreq)) % 12 );
             const roundedDiff = Math.min(diff, 12 - diff); // handle wrapping around octave
            if (roundedDiff < minDiff) {
                minDiff = roundedDiff;
                closestFreq = freq;
            }
        }
        return closestFreq;
    }
    
    return availableFrequencies[Math.floor(Math.random() * availableFrequencies.length)];
}

function getChordTones(rootDegree: number, part: keyof typeof scaleFrequencies): number[] {
    const octaveSet = (Math.random() < 0.15 && scaleFrequencies[part].rare.length > 0)
        ? scaleFrequencies[part].rare
        : scaleFrequencies[part].primary;
    
    if (octaveSet.length === 0) return [];
    
    // Using 1, 3, 5 of the scale for the chord
    const chordToneDegrees = [rootDegree, rootDegree + 2, rootDegree + 4];
    
    return chordToneDegrees.map(degree => {
        const safeDegree = degree % scaleIntervals.length;
        const targetInterval = scaleIntervals[safeDegree];
        const rootFreqOfNote = getNoteFrequency(currentKey, 0, targetInterval);
        
        let closestFreq = octaveSet[0];
        let minDiff = Infinity;
        
        for (const freq of octaveSet) {
             const diff = Math.abs( (12 * Math.log2(freq/rootFreqOfNote)) % 12 );
             const roundedDiff = Math.min(diff, 12 - diff);
             if (roundedDiff < minDiff) {
                minDiff = roundedDiff;
                closestFreq = freq;
            }
        }
        return closestFreq;
    }).filter((value, index, self) => self.indexOf(value) === index); // Filter for unique frequencies
}


// --- PATTERN GENERATION ---

function generatePattern() {
    if (scaleFrequencies.bass.primary.length === 0) {
        updateMusicContext();
    }
    
    const pattern: AutopilotPattern = { melody: [], accompaniment: [], bass: [], effects: [] };
    const measureDuration = durationToSeconds('1m', currentBpm);
    const sixteenthNoteDuration = durationToSeconds('16n', currentBpm);
    const eighthNoteDuration = durationToSeconds('8n', currentBpm);
    const quarterNoteDuration = durationToSeconds('4n', currentBpm);
    const halfNoteDuration = durationToSeconds('2n', currentBpm);
    
    const rootDegrees = [0, 1, 3, 4]; // Example degrees from a pentatonic scale

    for (let measure = 0; measure < 4; measure++) {
        const measureStartTime = measure * measureDuration;
        const chordRootDegree = rootDegrees[measure % rootDegrees.length];
        
        // --- BASS ---
        const bassRhythms = [
            [{ time: 0, dur: halfNoteDuration + quarterNoteDuration }],
            [{ time: 0, dur: halfNoteDuration }, { time: halfNoteDuration, dur: quarterNoteDuration }],
            [{ time: 0, dur: quarterNoteDuration }, {time: quarterNoteDuration, dur: quarterNoteDuration}, {time: halfNoteDuration, dur: halfNoteDuration}],
            [{ time: 0, dur: measureDuration }],
        ];
        const bassRhythm = bassRhythms[Math.floor(Math.random() * bassRhythms.length)];
        
        bassRhythm.forEach(note => {
            const rootBassFreq = getFrequencyForPart('bass', chordRootDegree);
            if (!rootBassFreq) return;

            let time = measureStartTime + note.time;
            if (Math.random() < 0.3) { // Syncopation
                time += (Math.random() < 0.5 ? 1 : -1) * eighthNoteDuration * 0.5;
            }
            
            const freq = (Math.random() < 0.2) 
                ? getFrequencyForPart('bass', chordRootDegree + 4) ?? rootBassFreq
                : rootBassFreq;

            pattern.bass.push({
                time: time,
                freq: freq,
                dur: note.dur * 0.9,
                vel: 0.5 + Math.random() * 0.2
            });
        });
        
        // --- ACCOMPANIMENT (ARPEGGIO with Syncopation) ---
        const accompanimentChordTones = getChordTones(chordRootDegree, 'accompaniment');
        if (accompanimentChordTones.length > 0) {
            const arpPatterns = [ [0, 1, 2, 1], [0, 2, 1, 0], [0, 1, 0, 2], [0, 1, 2, 0] ];
            const arpPattern = arpPatterns[Math.floor(Math.random() * arpPatterns.length)];
            
            for (let i = 0; i < 8; i++) { // eighth notes resolution
                 if (Math.random() > 0.35) { // Sparseness
                    const noteIndexInChord = arpPattern[i % arpPattern.length];
                    const freq = accompanimentChordTones[noteIndexInChord % accompanimentChordTones.length];
                    if (freq) {
                        let time = measureStartTime + i * eighthNoteDuration;
                        if (Math.random() < 0.2) { // Syncopation chance
                             time += (Math.random() - 0.5) * eighthNoteDuration;
                        }
                        pattern.accompaniment.push({
                            time,
                            freq: freq,
                            dur: eighthNoteDuration * (Math.random() * 1.5 + 0.5),
                            vel: 0.4 * Math.random() + 0.2
                        });
                    }
                 }
            }
        }
        
        // --- MELODY (ARPEGGIATOR with Syncopation) ---
        const melodyChordTones = getChordTones(chordRootDegree, 'melody');
        if (melodyChordTones.length > 0) {
            const arpPatterns = [ [0, 1, 2, 3], [3, 2, 1, 0], [0, 2, 1, 3], [0, 1, 3, 2] ]; // Pentatonic has 5 notes, use 4 for arps
            const arpPattern = arpPatterns[Math.floor(Math.random() * arpPatterns.length)];
            const numNotes = Math.random() > 0.5 ? 8 : 4; // Generate 4 (quarters) or 8 (eighths) notes

            for (let i = 0; i < numNotes; i++) {
                 if (Math.random() > 0.2) { // Sparseness
                    const noteIndexInChord = arpPattern[i % arpPattern.length];
                    const freq = melodyChordTones[noteIndexInChord % melodyChordTones.length];
                    
                    if (freq) {
                        let time = measureStartTime + i * (measureDuration / numNotes);
                        if (Math.random() < 0.4) { // Syncopation
                             time += (Math.random() - 0.5) * (measureDuration / numNotes);
                        }
                        pattern.melody.push({
                            time,
                            freq,
                            dur: (measureDuration / numNotes) * (Math.random() * 1.2 + 0.8),
                            vel: 0.5 * Math.random() + 0.4
                        });
                    }
                 }
            }
        }
            
        // --- EFFECTS ---
        if (Math.random() > 0.7) { // 30% chance of an effect per measure
            const effectFreq = getFrequencyForPart('melody'); // Use melody range for high notes
            if (effectFreq) {
                pattern.effects.push({
                    time: measureStartTime + Math.random() * measureDuration,
                    freq: effectFreq,
                    dur: halfNoteDuration * (Math.random() + 0.5),
                    vel: 0.5
                })
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

    