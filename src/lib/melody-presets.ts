
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
            distortion: 0,
        }
    },
    {
        id: "organ",
        name: "Organ",
        params: {
            // Hammond-like sound using additive synthesis (summing sine waves)
            oscillator: { type: 'sine' },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 1.0 },
            filter: { Q: 0.7, frequency: 1200, type: 'lowpass' },
            portamento: 0,
            distortion: 2,
            reverbSend: -18,
            layers: [
                {
                    // 2nd Harmonic (Octave Up)
                    oscillator: { type: 'sine', detune: 1200 }, // +12 semitones
                    envelope: { attack: 0.03, decay: 0.1, sustain: 0.9, release: 1.0 },
                    gain: 0.75, // Slightly lower volume
                },
                {
                    // 3rd Harmonic (Octave + Fifth Up)
                    oscillator: { type: 'sine', detune: 1900 }, // +19 semitones
                    envelope: { attack: 0.04, decay: 0.1, sustain: 0.9, release: 1.0 },
                    gain: 0.5, // Lower volume
                }
            ],
        }
    },
    {
        id: "mellotron",
        name: "Mellotron",
        params: {
            // A 'fat' sawtooth gives a nice, slightly detuned/chorused feel
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.3, decay: 0.2, sustain: 0.6, release: 1.5 },
            filter: { Q: 1.5, frequency: 500, type: 'lowpass' },
            portamento: 0.01,
            distortion: 5,
            reverbSend: -12,
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
            distortion: 0,
            reverbSend: -9,
        }
    }
];

export const defaultMelodyInstrument: Instrument = 'synth';
