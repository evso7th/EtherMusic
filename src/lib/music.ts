
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

export function getScaleFrequencies(baseMidiNote: number, scaleSteps: number[], octaves: number[]): number[] {
    const freqs: number[] = [];
    octaves.forEach(octave => {
        scaleSteps.forEach(interval => {
            const midiNote = baseMidiNote + (octave * 12) + interval;
            const freq = Math.pow(2, (midiNote - 69) / 12) * 440;
            freqs.push(freq);
        });
    });
    return freqs.sort((a, b) => a - b);
}

    