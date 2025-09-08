
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
        name: "Organ",
        params: {
            oscillator: { type: 'sine' }, // Fundamental 8'
            envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 2.5 },
            filter: { Q: 2.5, frequency: 1500, type: 'peaking', gain: 6 },
            vibrato: { frequency: 4.5, depth: 1.5 },
            portamento: 0,
            layers: [
                { type: 'sine', freqMult: 0.5, level: 0.65, detune: -2 },  // Sub Octave (16')
                { type: 'sine', freqMult: 2.0, level: 0.5, detune: 2 },     // Octave (4')
                { type: 'sine', freqMult: 3.0, level: 0.3, detune: 0 },     // Fifth (2 2/3')
                { type: 'sine', freqMult: 4.0, level: 0.25, detune: 2 },    // Super Octave (2')
                { type: 'triangle', freqMult: 6.0, level: 0.1, detune: -2}, // Twelfth (1 1/3') - for brightness
            ],
        }
    },
    {
        id: "mellotron",
        name: "Mellotron",
        params: {
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.3, decay: 0.2, sustain: 0.6, release: 1.5 },
            filter: { Q: 8, frequency: 1500, type: 'lowpass', gain: 0 },
            vibrato: { frequency: 4.5, depth: 3 },
            portamento: 0.01,
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
