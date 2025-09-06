
import type { InstrumentPreset, Instrument } from "@/types";

export const melodyInstruments: readonly InstrumentPreset[] = [
    {
        id: "synth",
        name: "Synth",
        params: {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.15, decay: 0.5, sustain: 0.4, release: 1.0 },
            filter: { Q: 1.0, frequency: 700, type: 'lowpass' },
            portamento: 0.03
        }
    },
    {
        id: "organ",
        name: "Organ",
        params: {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 1.0 },
            filter: { Q: 0.7, frequency: 600, type: 'lowpass' },
            portamento: 0
        }
    },
    {
        id: "mellotron",
        name: "Mellotron",
        params: {
            // Using 'fatsine' to simulate a slightly detuned/chorus effect
            oscillator: { type: 'sawtooth' }, // fat types aren't standard, let's use sawtooth for a richer tone
            envelope: { attack: 0.3, decay: 0.2, sustain: 0.6, release: 1.5 },
            filter: { Q: 0.5, frequency: 500, type: 'lowpass' },
            portamento: 0.01
        }
    },
    {
        id: "theremin",
        name: "Theremin",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.3, decay: 0.1, sustain: 1.0, release: 1.5 },
            filter: { Q: 0.6, frequency: 600, type: 'lowpass' },
            portamento: 0.08
        }
    }
];

export const defaultMelodyInstrument: Instrument = 'synth';

    