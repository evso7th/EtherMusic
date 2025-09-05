
// UI Component Props
export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';

export type Instrument = 'synth' | 'organ' | 'theremin' | 'E-Bells' | 'mellotron' | 'G-Drops' | 'ebass';

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
