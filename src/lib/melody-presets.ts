
import type { InstrumentPreset, Instrument, BassInstrumentPresetParams } from "@/types";

export const melodyInstruments: readonly InstrumentPreset[] = [
    {
        id: "synth",
        name: "Synth",
        params: {
            oscillator: { type: 'triangle', detune: -5 },
            envelope: { attack: 0.15, decay: 0.5, sustain: 0.4, release: 1.0 },
            filter: { Q: 1.0, frequency: 700, type: 'lowpass', gain: 0 },
            portamento: 0.03,
            layers: [
                { type: 'sawtooth', freqMult: 0.5, level: 0.3, detune: 2 },
                { type: 'sine', freqMult: 2, level: 0.5, detune: -2 },
            ],
            stagger: 0.005,
            reverbSend: -18,
            distortion: 5,
        }
    },
    {
        id: "organ",
        name: "Орган",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 2.5 },
            filter: { Q: 4, frequency: 1500, type: 'peaking', gain: 6 },
            vibrato: { frequency: 5.5, depth: 2 },
            portamento: 0,
            layers: [
                { type: 'sine', freqMult: 1, level: 1.0, detune: 0 },
                { type: 'sine', freqMult: 0.5, level: 0.8, detune: -2 },
                { type: 'sine', freqMult: 2, level: 0.7, detune: 2 },
                { type: 'triangle', freqMult: 1.5, level: 0.5, detune: -3 },
                { type: 'sine', freqMult: 4.0, level: 0.4, detune: 3 },
                { type: 'triangle', freqMult: 6.0, level: 0.2, detune: -4}, 
            ],
            reverbSend: -12,
            distortion: 0,
        }
    },
    {
        id: "mellotron",
        name: "Mellotron",
        params: {
            oscillator: { type: 'sawtooth', detune: 3 },
            envelope: { attack: 0.3, decay: 0.2, sustain: 0.6, release: 1.5 },
            filter: { Q: 8, frequency: 1500, type: 'lowpass', gain: 0 },
            vibrato: { frequency: 4.5, depth: 3 },
            portamento: 0.01,
            layers: [
                { type: 'triangle', freqMult: 1.0, level: 0.6, detune: -5 },
                { type: 'sine', freqMult: 2.0, level: 0.4, detune: 5 },
            ],
            reverbSend: -20,
            distortion: 10,
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
            portamento: 0.1,
            layers: [
                { type: 'sine', freqMult: 1.0, level: 0.8, detune: 4 },
            ],
            reverbSend: -15,
            distortion: 0,
        }
    }
];

export const defaultMelodyInstrument: Instrument = 'synth';
