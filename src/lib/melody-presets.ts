
import type { InstrumentPreset, Instrument, InstrumentPresetParams } from "@/types";

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
            oscillator: { type: 'sine' }, // Base layer
            envelope: { attack: 0.1, decay: 0.2, sustain: 0.9, release: 0.8 },
            filter: { Q: 3, frequency: 1200, type: 'peaking', gain: 12 },
            vibrato: { frequency: 5.5, depth: 2 },
            portamento: 0,
            layers: [
                { type: 'sine', freqMult: 2.0, level: 0.75, detune: 2 },    // Octave
                { type: 'sine', freqMult: 3.0, level: 0.5, detune: -2 },   // Fifth
                { type: 'sine', freqMult: 0.5, level: 0.75, detune: 0 },   // Sub Octave
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
