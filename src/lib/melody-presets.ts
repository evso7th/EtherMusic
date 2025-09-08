
import type { InstrumentPreset, Instrument } from "@/types";

export const melodyInstruments: readonly InstrumentPreset[] = [
    {
        id: "synth",
        name: "Synth",
        params: {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.15, decay: 0.5, sustain: 0.4, release: 1.0 },
            filter: { Q: 1.0, frequency: 700, type: 'lowpass', gain: 0 },
            portamento: 0.03,
        }
    },
    {
        id: "organ",
        name: "Орган",
        params: {
            oscillator: { type: 'sine' }, // Fundamental 8'
            envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 3.5 },
            filter: { Q: 3.5, frequency: 1800, type: 'peaking', gain: 5 },
            vibrato: { frequency: 5, depth: 3 },
            portamento: 0,
            layers: [
                { type: 'sine', freqMult: 0.5, level: 0.7, detune: -2 },  // Sub Octave (16')
                { type: 'sine', freqMult: 2, level: 0.6, detune: 2 },     // Octave (4')
                { type: 'triangle', freqMult: 3, level: 0.4, detune: -3 }, // Fifth (2 2/3')
                { type: 'sine', freqMult: 4.0, level: 0.3, detune: 3 },    // Super Octave (2')
                { type: 'triangle', freqMult: 6.0, level: 0.2, detune: -4}, // Twelfth (1 1/3')
            ],
        }
    },
    {
        id: "mellotron",
        name: "Mellotron",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.3, decay: 0.2, sustain: 0.6, release: 1.5 },
            filter: { Q: 8, frequency: 1500, type: 'lowpass', gain: 0 },
            vibrato: { frequency: 4.5, depth: 3 },
            portamento: 0.01,
            layers: [
                { type: 'triangle', freqMult: 1.0, level: 0.8, detune: -5 },
                { type: 'sine', freqMult: 2.0, level: 0.6, detune: 5 },
                { type: 'sawtooth', freqMult: 0.5, level: 0.2, detune: -10 }
            ],
        }
    },
    {
        id: "theremin",
        name: "Theremin",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.3, decay: 0.1, sustain: 1.0, release: 1.5 },
            filter: { Q: 0.6, frequency: 2000, type: 'lowpass', gain: 0 },
            vibrato: { frequency: 6, depth: 5 },
            portamento: 0.08,
        }
    }
];

export const defaultMelodyInstrument: Instrument = 'synth';
