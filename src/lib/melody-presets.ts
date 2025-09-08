
import type { InstrumentPreset, Instrument } from "@/types";

export const melodyInstruments: readonly InstrumentPreset[] = [
    {
        id: "synth",
        name: "Synth",
        params: {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.15, decay: 0.5, sustain: 0.4, release: 1.0 },
            filter: { Q: 1.0, frequency: 700, type: 'lowpass' },
            portamento: 0.03,
            reverbSend: -18,
            distortion: 0,
        }
    },
    {
        id: "organ",
        name: "Organ",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 1.0 },
            filter: { Q: 0.7, frequency: 1200, type: 'lowpass' },
            portamento: 0,
            reverbSend: -18,
            distortion: 2,
            layers: [
                {
                    oscillator: { type: 'sine', detune: 1200 }, // 1st Octave
                    envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 1.0 },
                    gain: 0.75,
                },
                {
                    oscillator: { type: 'sine', detune: 700 }, // A fifth
                    envelope: { attack: 0.03, decay: 0.1, sustain: 0.9, release: 1.0 },
                    gain: 0.5, 
                }
            ],
        }
    },
    {
        id: "mellotron",
        name: "Mellotron",
        params: {
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.3, decay: 0.2, sustain: 0.6, release: 1.5 },
            filter: { Q: 1.5, frequency: 500, type: 'lowpass' },
            portamento: 0.01,
            reverbSend: -12,
            distortion: 5,
        }
    },
    {
        id: "theremin",
        name: "Theremin",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.3, decay: 0.1, sustain: 1.0, release: 1.5 },
            filter: { Q: 0.6, frequency: 600, type: 'lowpass' },
            portamento: 0.08,
            reverbSend: -9,
            distortion: 0,
        }
    }
];

export const defaultMelodyInstrument: Instrument = 'synth';
