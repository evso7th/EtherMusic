
import type { BassInstrumentPreset, BassInstrument, InstrumentPreset, InstrumentPresetParams } from "@/types";
import { melodyInstruments } from "./melody-presets";

// Function to adapt a melody preset for bass use
const adaptMelodyPresetForBass = (preset: InstrumentPreset): BassInstrumentPreset => {
    // Add default bass-specific effects if they don't exist
    const params: BassInstrumentPreset['params'] = {
        ...preset.params,
        reverbSend: preset.params.reverbSend ?? -48,
        distortion: preset.params.distortion ?? 0,
    };

    return {
        id: preset.id as BassInstrument, // We'll ensure the IDs match in the types
        name: preset.name,
        description: `Bass version of the ${preset.name} sound.`,
        params: params,
    };
};

const classicBassPreset: BassInstrumentPreset = {
    id: "classicBass",
    name: "Classic Bass",
    description: "A sharp, rhythmic, classic bass guitar sound.",
    params: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
        filter: { Q: 1, frequency: 800, type: 'lowpass', gain: 6 },
        reverbSend: -48,
        distortion: 10,
        layers: [
            { type: 'square', freqMult: 0.5, level: 0.5, detune: -10 },
            { type: 'sine', freqMult: 1, level: 0.8, detune: 10 }
        ],
    }
};

// Adapt melody presets for bass
const organBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'organ')!);
const mellotronBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'mellotron')!);
const synthBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'synth')!);

// Redefine bassInstruments with the new set
export const bassInstruments: readonly BassInstrumentPreset[] = [
    classicBassPreset,
    organBass,
    mellotronBass,
    synthBass
];

export const defaultBassInstrument: BassInstrument = 'classicBass';
