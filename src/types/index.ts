
// Autopilot
export type AutopilotPart = 'melody' | 'accompaniment' | 'bass' | 'effects';

export type AutopilotStyle = {
  name: 'Evolve';
  description: string;
};

// Notes
export type NoteEvent = {
    id?: number;
    part: AutopilotPart;
    freq: number;
    dur: string; 
    vel: number;
    time: number; 
};

export type NoteUpdateEvent = {
    id: number;
    part: AutopilotPart;
    freq: number;
    rampTime: string;
};


// Worker Communication
export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'tick', time: number }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setTempo', bpm: number }
    | { type: 'setDensity', density: number };

export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent }
    | { type: 'updateNote', note: NoteUpdateEvent }
    | { type: 'playNotesBatch', notes: NoteEvent[] };


// UI Component Props
export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';

export type Instrument = 'synth' | 'organ' | 'theremin' | 'E-Bells' | 'mellotron' | 'G-Drops' | 'ebass' | 'autopilot_effect_star' | 'autopilot_effect_meteor' | 'autopilot_effect_bell' | 'autopilot_effect_chimes';

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
    autopilot: number;
    accompaniment: number;
    autopilotBass: number;
    effects: number;
};

    