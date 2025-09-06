
// UI Component Props
export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';

export type Instrument = 'synth' | 'organ' | 'theremin' | 'mellotron';
export type BassInstrument = 'classicBass' | 'glideBass' | 'ambientDrone' | 'resonantGliss' | 'hypnoticDrone' | 'livingRiff';

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
}

export interface BassInstrumentPresetParams extends InstrumentPresetParams {
    distortion?: number;
    layers?: {
        oscillator: { type: OscillatorType };
        envelope: { attack: number, release: number };
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

export type Volumes = { 
    melody: number; 
    manualBass: number;
    latch: number; 
    drums: number; 
};

export interface Note {
    id: number;
    frequency: number;
    volume: number;
}

    