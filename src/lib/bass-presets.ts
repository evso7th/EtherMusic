
import type { BassInstrumentPreset, BassInstrument } from "@/types";

export const bassInstruments: readonly BassInstrumentPreset[] = [
    {
        id: "classicBass",
        name: "Classic Bass",
        description: "Чёткий, ритмичный, как настоящая бас-гитара",
        params: {
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
            filter: { Q: 0.7, frequency: 400, type: 'lowpass' },
            reverbSend: -48,
            distortion: 5,
        }
    },
    {
        id: "glideBass",
        name: "Glide Bass",
        description: "Плавный, как скольжение по струне",
        params: {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 1.5 },
            filter: { Q: 0.5, frequency: 300, type: 'lowpass' },
            portamento: 0.03,
            reverbSend: -36,
            distortion: 0,
        }
    },
    {
        id: "ambientDrone",
        name: "Ambient Drone",
        description: "Тёмный, плотный, как вибрация под землёй",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.2, decay: 0.1, sustain: 1.0, release: 3.0 },
            filter: { Q: 1.2, frequency: 120, type: 'lowpass' },
            portamento: 0.08,
            reverbSend: -24,
            distortion: 0,
        }
    },
    {
        id: "resonantGliss",
        name: "Resonant Gliss",
        description: "Резонирующий, с 'пением', идеален для глиссандо",
        params: {
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 1.0 },
            filter: { Q: 1.4, frequency: 500, type: 'lowpass' },
            portamento: 0.06,
            reverbSend: -18,
            distortion: 10,
        }
    },
    {
        id: "hypnoticDrone",
        name: "Hypnotic Drone",
        description: "Вибрация земли со стерео-движением",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.2, decay: 0.1, sustain: 1.0, release: 3.0 },
            filter: { Q: 1.0, frequency: 150, type: 'lowpass' },
            distortion: 0,
            reverbSend: -20,
            layers: [
                {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.1, decay: 0.1, sustain: 1.0, release: 2.0 },
                    gain: 1.0
                }
            ],
            stagger: 0.015
        }
    },
    {
        id: "livingRiff",
        name: "Living Riff",
        description: "Живой, дышащий рифф с характером",
        params: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 1.0 },
            filter: { Q: 1.0, frequency: 350, type: 'lowpass' },
            reverbSend: -30,
            distortion: 15,
            layers: [
                 {
                    oscillator: { type: 'sawtooth' },
                    envelope: { attack: 0.05, decay: 0.3, sustain: 0.5, release: 1.5 },
                    gain: 1.0,
                }
            ],
            stagger: 0.005
        }
    },
];

export const defaultBassInstrument: BassInstrument = 'classicBass';

    
