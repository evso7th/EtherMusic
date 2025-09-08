
import type { BassInstrumentPreset, BassInstrument, InstrumentPreset, InstrumentPresetParams } from "@/types";
import { melodyInstruments } from "./melody-presets";

const adaptMelodyPresetForBass = (preset: InstrumentPreset): BassInstrumentPreset => {
    const bassParams: BassInstrumentPresetParams = JSON.parse(JSON.stringify(preset.params));

    bassParams.envelope.release = 1.5; 
    bassParams.portamento = 0.02;      
    
    if (bassParams.filter) {
        bassParams.filter.frequency = Math.min(bassParams.filter.frequency, 800);
        bassParams.filter.Q = (bassParams.filter.Q || 1) * 1.2;
    } else {
        bassParams.filter = { type: 'lowpass', frequency: 800, Q: 1, gain: 0 };
    }
    
    bassParams.reverbSend = preset.params.reverbSend ?? -48;
    bassParams.distortion = preset.params.distortion ?? 10;
    
    if (!bassParams.layers || bassParams.layers.length === 0) {
        bassParams.layers = [];
    }

    // Ensure a sub-octave for body
    const hasSub = bassParams.layers.some(l => l.freqMult < 1);
    if (!hasSub) {
        bassParams.layers.unshift({ type: 'sine', freqMult: 0.5, level: 0.8, detune: -5 });
    }
    
    return {
        id: preset.id as BassInstrument,
        name: preset.name,
        description: `Bass version of the ${preset.name} sound.`,
        params: bassParams,
    };
};

const classicBassPreset: BassInstrumentPreset = {
    id: "classicBass",
    name: "Classic Bass",
    description: "A sharp, rhythmic, classic bass guitar sound.",
    params: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.9 },
        filter: { Q: 2, frequency: 600, type: 'lowpass', gain: 6 }, // Increased gain
        reverbSend: -48,
        distortion: 15,
        layers: [
            { type: 'square', freqMult: 0.5, level: 1.0, detune: -10 },
        ],
    }
};

const organBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'organ')!);
organBass.id = 'organ';
organBass.params.reverbSend = -30;
organBass.params.distortion = 5;
organBass.params.filter!.frequency=1200;
organBass.params.filter!.gain = 4;


const mellotronBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'mellotron')!);
mellotronBass.id = 'mellotron';
mellotronBass.params.reverbSend = -24;
mellotronBass.params.distortion = 25; 
mellotronBass.params.filter!.frequency=1000;
mellotronBass.params.filter!.gain = 3;


const synthBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'synth')!);
synthBass.id = 'synth';
synthBass.params.reverbSend = -36;
synthBass.params.distortion = 5;
synthBass.params.filter!.frequency=900;
synthBass.params.filter!.gain = 5;

const ambientDronePreset: BassInstrumentPreset = {
    id: "ambientDrone",
    name: "Ambient Drone",
    description: "A dark, dense, underground vibration.",
    params: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.5, decay: 1, sustain: 1, release: 4.0 },
        filter: { Q: 1.2, frequency: 250, type: 'lowpass', gain: 8 },
        portamento: 0.08,
        reverbSend: -18,
        distortion: 5,
        layers: [
            { type: 'triangle', freqMult: 0.5, level: 0.9, detune: -12 },
            { type: 'sine', freqMult: 1.5, level: 0.6, detune: 12 },
        ],
    }
};

const hypnoticDronePreset: BassInstrumentPreset = {
    id: "hypnoticDrone",
    name: "Hypnotic Drone",
    description: "An earthy vibration with stereo movement.",
    params: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.3, decay: 0.5, sustain: 0.9, release: 3.0 },
        filter: { Q: 1, frequency: 300, type: 'lowpass', gain: 7 },
        portamento: 0.05,
        reverbSend: -20,
        distortion: 10,
        layers: [
            { type: 'triangle', freqMult: 1.0, level: 0.8, detune: -5 },
            { type: 'sine', freqMult: 2, level: 0.5, detune: 5 },
        ],
        stagger: 0.02
    }
};

export const bassInstruments: readonly BassInstrumentPreset[] = [
    classicBassPreset,
    organBass,
    mellotronBass,
    synthBass,
    ambientDronePreset,
    hypnoticDronePreset
];

export const defaultBassInstrument: BassInstrument = 'classicBass';
