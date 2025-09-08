
import type { BassInstrumentPreset, BassInstrument, InstrumentPreset } from "@/types";
import { melodyInstruments } from "./melody-presets";

// Function to adapt a melody preset for bass use, with specific bass adjustments
const adaptMelodyPresetForBass = (preset: InstrumentPreset): BassInstrumentPreset => {
    // Start with a copy of the melody params
    const bassParams = JSON.parse(JSON.stringify(preset.params));

    // Bass-specific adjustments
    bassParams.envelope.release = 0.8; // Shorter release for bass
    bassParams.portamento = 0.02;      // A bit of glide
    
    // Adjust filter for bass - make it lower and more resonant
    if (bassParams.filter) {
        bassParams.filter.frequency = Math.min(bassParams.filter.frequency, 800);
        bassParams.filter.Q = (bassParams.filter.Q || 1) * 1.2;
    } else {
        bassParams.filter = { type: 'lowpass', frequency: 800, Q: 1, gain: 0 };
    }
    
    // Bass-specific effects
    bassParams.reverbSend = preset.params.reverbSend ?? -48;
    bassParams.distortion = preset.params.distortion ?? 10;
    
    // Ensure layers are appropriate for bass
    if (bassParams.layers && bassParams.layers.length > 0) {
        // Make the first layer an octave lower if it's not already
        if (bassParams.layers[0].freqMult && bassParams.layers[0].freqMult >= 1) {
             // bassParams.layers[0].freqMult *= 0.5;
        }
    } else {
        // if no layers, add a sub-octave for body
        bassParams.layers = [{ type: 'sine', freqMult: 0.5, level: 0.7, detune: -5 }];
    }
    bassParams.oscillator.type = 'sawtooth';

    return {
        id: preset.id as BassInstrument, // We'll ensure the IDs match in the types
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
        filter: { Q: 2, frequency: 600, type: 'lowpass', gain: 0 },
        reverbSend: -48,
        distortion: 15,
        layers: [
            { type: 'square', freqMult: 0.5, level: 0.8, detune: -10 },
        ],
    }
};

// Adapt melody presets for bass
const organBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'organ')!);
organBass.params.reverbSend = -30;
organBass.params.distortion = 5;
organBass.params.filter!.frequency=1000;


const mellotronBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'mellotron')!);
mellotronBass.params.reverbSend = -24;
mellotronBass.params.distortion = 25; // Give it that gritty tape sound
mellotronBass.params.filter!.frequency=800;


const synthBass = adaptMelodyPresetForBass(melodyInstruments.find(i => i.id === 'synth')!);
synthBass.params.reverbSend = -36;
synthBass.params.distortion = 5;
synthBass.params.filter!.frequency=700;


// Redefine bassInstruments with the new set
export const bassInstruments: readonly BassInstrumentPreset[] = [
    classicBassPreset,
    organBass,
    mellotronBass,
    synthBass
];

export const defaultBassInstrument: BassInstrument = 'classicBass';

