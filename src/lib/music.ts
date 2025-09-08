
import type { MusicKey, MusicScale } from "@/types";

export const ALL_NOTES: Record<MusicKey, number> = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
};

export const SCALES: Record<MusicScale, number[]> = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10]
};

const noteNameToMidi = (note: MusicKey, octave: number): number => {
    return ALL_NOTES[note] + (octave + 1) * 12;
}

export function getScaleFrequencies(key: MusicKey, scale: MusicScale, octaves: number[]): number[] {
    const scaleIntervals = SCALES[scale];
    if (!scaleIntervals) return [];

    const rootMidi = noteNameToMidi(key, 0); // Use a base octave of 0 for calculation
    const freqs: number[] = [];
    
    octaves.forEach(octave => {
        scaleIntervals.forEach(interval => {
            const midiNote = rootMidi + (octave * 12) + interval;
            const freq = Math.pow(2, (midiNote - 69) / 12) * 440;
            freqs.push(freq);
        });
    });
    
    // Add the octave above the highest note for a complete scale
    const highestNoteInScale = rootMidi + (octaves[octaves.length - 1] * 12) + scaleIntervals[scaleIntervals.length - 1];
    const topNote = highestNoteInScale + (12 - scaleIntervals[scaleIntervals.length - 1]);
    freqs.push(Math.pow(2, (topNote - 69) / 12) * 440);

    return freqs.sort((a, b) => a - b);
}
