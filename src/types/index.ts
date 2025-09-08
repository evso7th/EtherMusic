
// UI Component Props
export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';

export type Instrument = 'synth' | 'organ' | 'theremin' | 'mellotron';
export type BassInstrument = 'classicBass' | 'glideBass' | 'ambientDrone' | 'resonantGliss' | 'hypnoticDrone' | 'livingRiff';

// These presets are sent to the AudioWorklet, so they must contain only serializable data.
// No Tone.js-specific objects.
export interface InstrumentPresetParams {
    oscillator: {
        type: OscillatorType;
    };
    envelope: {
        attack: number;
        decay: number;
        sustain: number;
        release: number;
    };
    filter: {
        Q: number;
        frequency: number;
        type: BiquadFilterType;
    };
    portamento?: number;
    distortion?: number;
    reverbSend?: number; // Added to individual presets
}

export interface BassInstrumentPresetParams extends InstrumentPresetParams {
    layers?: {
        oscillator: { type: OscillatorType };
        envelope: { attack: number; decay: number, sustain: number, release: number; };
    }[];
    stagger?: number;
}


export interface InstrumentPreset {
    id: Instrument;
    name: string;
    params: InstrumentPresetParams;
}

export interface BassInstrumentPreset {
    id: BassInstrument;
    name: string;
    description: string;
    params: BassInstrumentPresetParams;
}

export type Tempo = {
    name: string;
    bpm: number;
};

export type BeatPattern = {
    name: string;
    type: 'Meditative' | 'Classic' | 'System';
};

// New structured volume type
export interface ChannelVolumes {
  gain: number;
  reverbSend: number; 
  distortion: number; 
}

export interface CompressorSettings {
    enabled: boolean;
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
}

export interface Volumes {
  melody: ChannelVolumes;
  manualBass: ChannelVolumes;
  latch: ChannelVolumes;
  drums: ChannelVolumes;
  reverbReturn: number;
  compressor: CompressorSettings;
}


export interface Note {
    id: number;
    frequency: number;
    volume: number;
}
