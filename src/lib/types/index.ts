

import type { Emitter } from "mitt";

// UI Component Props
export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';

export type Instrument = 'synth' | 'organ' | 'theremin' | 'mellotron';
export type BassInstrument = 'classicBass' | 'organ' | 'mellotron' | 'synth' | 'ambientDrone' | 'hypnoticDrone';

// These presets are sent to the AudioWorklet, so they must contain only serializable data.
export interface BaseInstrumentParams {
    oscillator: {
        type: OscillatorType;
        detune?: number; 
    };
    envelope: {
        attack: number;
        decay: number;
        sustain: number;
        release: number;
        attackCurve?: EnvelopeCurve;
        decayCurve?: EnvelopeCurve;
        releaseCurve?: EnvelopeCurve;
    };
    filter?: {
        Q: number;
        frequency: number;
        gain: number;
        type: BiquadFilterType;
    } | null;
    portamento?: number;
    vibrato?: {
        frequency: number;
        depth: number;
    } | null;
    layers?: {
        type: OscillatorType;
        freqMult: number; // Frequency multiplier relative to base
        level: number; // Volume level (0-1)
        detune?: number; // Detune in cents
        envelope?: Partial<Omit<BaseInstrumentParams['envelope'], 'attackCurve' | 'decayCurve' | 'releaseCurve'>>;
    }[];
    stagger?: number; // Delay between layer note ons in seconds
    reverbSend?: number;
    distortion?: number;
}

export interface InstrumentPresetParams extends BaseInstrumentParams {}

// Bass instruments have their own effect settings that are part of the preset
export interface BassInstrumentPresetParams extends BaseInstrumentParams {
    reverbSend: number; // in dBFS, e.g., -12
    distortion: number; // 0-100
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

export type BeatPattern = {
    name: string;
    type: 'Meditative' | 'Classic' | 'System' | 'Fill';
    length: number; // in measures
    sequence: { time: number; note: string; vol?: number }[];
};


// Volume settings for a single channel (instrument)
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
  reverbReturn: number; // in dB
  compressor: CompressorSettings;
  swing: number;
  tempo: number;
}

export interface SynthNote {
    id: number;
    frequency: number;
    volume: number;
    duration?: number;
    time?: number;
}


export type WorkerMessage = 
    | { type: 'noteOn', note: SynthNote }
    | { type: 'noteOff', id: number }
    | { type: 'noteUpdate', note: SynthNote }
    | { type: 'allNotesOff' }
    | { type: 'setPreset', preset: InstrumentPresetParams | BassInstrumentPresetParams };

export type DrumWorkerMessage =
    | { type: 'loadSample'; name: string; buffer: ArrayBuffer; }
    | { type: 'playSample'; sampleName: string; volume?: number; };


export type EnvelopeCurve = "linear" | "exponential";


export interface Note {
    id: number;
    frequency: number;
    volume: number;
    duration?: number; // for autopilot and scheduled notes
    time?: number; // for autopilot and scheduled notes
}

// Autopilot functionality is deprecated and moved to AuraGroove app.
// Types are kept for reference but are not actively used.
export interface AutopilotSettings {
    enabled: boolean;
    style: string;
    density: number;
    key: MusicKey;
    scale: MusicScale;
    instruments: {
        melody: Instrument;
        accompaniment: Instrument;
        bass: BassInstrument;
    }
}

export type AudioEngineEvents = {
    playStateChanged: boolean;
    volumesChanged: Volumes;
};
