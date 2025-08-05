

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotStyle = 'Ambient' | 'Sequence';
export type AutopilotPart = 'melody' | 'accompaniment' | 'bass' | 'effects';

export type NoteEvent = {
    id?: number; // Unique ID for notes that need to be updated
    part: AutopilotPart;
    freq: number;
    dur: Unit.Time;
    vel: number;
    time: number; // Absolute time for playback
};

export type NoteUpdateEvent = {
    id: number;
    part: AutopilotPart;
    freq: number;
    rampTime: Unit.Time;
};


export type WorkerEvent =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'tick', time: number }
    | { type: 'setHarmony', key: MusicKey, scale: MusicScale }
    | { type: 'setTempo', bpm: number }
    | { type: 'setStyle', style: AutopilotStyle }
    | { type: 'setInstruments', instruments: Record<AutopilotPart, Instrument> };

export type WorkerResponse =
    | { type: 'playNote', note: NoteEvent }
    | { type: 'updateNote', note: NoteUpdateEvent };


// --- MUSIC THEORY HELPERS ---
const getScaleFrequencies = (key: MusicKey, scale: MusicScale, octaves: number[]): number[] => {
    const scaleIntervals: { [key in MusicScale]: string[] } = {
        'Major': ['0', '2', '4', '5', '7', '9', '11'], 'Minor': ['0', '2', '3', '5', '7', '8', '10'],
        'Major Pentatonic': ['0', '2', '4', '7', '9'], 'Minor Pentatonic': ['0', '3', '5', '7', '10'],
    };
    let allFrequencies: number[] = [];
    const intervals = scaleIntervals[scale];
    octaves.forEach(octave => {
        intervals.forEach(interval => {
            allFrequencies.push(Tone.Frequency(key + octave).transpose(interval).toFrequency());
        });
    });
    return allFrequencies.sort((a,b) => a - b);
};

// --- WORKER STATE ---
let state = {
    isRunning: false,
    tick16n: 0,
    currentStyle: 'Ambient' as AutopilotStyle,
    currentKey: 'G' as MusicKey,
    currentScale: 'Major' as MusicScale,
    currentBpm: 90,
    instruments: {
        melody: 'synth' as Instrument,
        accompaniment: 'synth' as Instrument,
        bass: 'ebass' as Instrument,
        effects: 'autopilot_effect_star' as Instrument
    },
    scaleFrequencies: {
        bass: [] as number[],
        accompaniment: [] as number[],
        melody: [] as number[],
    },
    // Style-specific state
    ambient: {
        chordProgression: [0, 4, 5, 3], // I-V-vi-IV in 0-based scale degrees
        currentChordDegree: 0,
        lastChordChangeTick: -Infinity,
        activeMelodyNoteId: null as number | null,
    },
    sequence: {
        bassNoteIndex: 0,
        accompanimentIndex: 0,
        lastMelodyNoteIndex: null as number | null,
        notesInCurrentPhrase: 0,
        maxNotesInPhrase: 5,
        nextMelodyTick: 0,
    }
};

function updateHarmony(key: MusicKey, scale: MusicScale) {
    state.currentKey = key;
    state.currentScale = scale;
    state.scaleFrequencies = {
        bass: getScaleFrequencies(key, scale, [1, 2]),
        accompaniment: getScaleFrequencies(key, scale, [3, 4]),
        melody: getScaleFrequencies(key, scale, [3, 4]),
    };
    // Reset melody memory on harmony change
    state.sequence.lastMelodyNoteIndex = null;
    state.ambient.lastChordChangeTick = -Infinity;
}

// --- "AMBIENT" STYLE ---
function tickAmbient(time: number) {
    const ticksPerMeasure = 16;
    const ticksForChordChange = ticksPerMeasure * 2; // Change chord every 2 measures

    // --- BASS (Drone) & ACCOMPANIMENT (Pads) ---
    if (state.tick16n % ticksForChordChange === 0) {
        state.ambient.currentChordDegree = (state.ambient.currentChordDegree + 1) % state.ambient.chordProgression.length;
        const scaleRootDegree = state.ambient.chordProgression[state.ambient.currentChordDegree];

        // Play Bass Drone
        const bassFreq = state.scaleFrequencies.bass[scaleRootDegree % state.scaleFrequencies.bass.length];
        const bassEvent: NoteEvent = {
            part: 'bass', freq: bassFreq,
            dur: '2m', vel: 0.5, time: Tone.now()
        };
        self.postMessage({ type: 'playNote', note: bassEvent });

        // Play Accompaniment Chord (Pad) - 3 notes
        const chordDegrees = [scaleRootDegree, scaleRootDegree + 2, scaleRootDegree + 4];
        chordDegrees.forEach((degree, index) => {
            const noteFreq = state.scaleFrequencies.accompaniment[degree % state.scaleFrequencies.accompaniment.length];
            const event: NoteEvent = {
                part: 'accompaniment', freq: noteFreq,
                dur: '1m', vel: 0.2 + (Math.random() * 0.1), time: Tone.now() + (index * 0.1) // Stagger start times slightly
            };
            self.postMessage({ type: 'playNote', note: event });
        });
    }

    // --- MELODY (Slow Pitch Bend) ---
    const ticksForMelodyChange = ticksPerMeasure * 4; // New melody note every 4 measures
    if (state.tick16n % ticksForMelodyChange === 0) {
        state.ambient.activeMelodyNoteId = Date.now() + Math.random();
        const startDegree = Math.floor(Math.random() * state.scaleFrequencies.melody.length);
        const startFreq = state.scaleFrequencies.melody[startDegree];
        
        // Find a target frequency that is different
        let endDegree = startDegree;
        while(endDegree === startDegree) {
            endDegree = Math.floor(Math.random() * state.scaleFrequencies.melody.length);
        }
        const endFreq = state.scaleFrequencies.melody[endDegree];
        
        const melodyDuration = Tone.Time('4m').toSeconds();
        const scheduledTime = Tone.now() + 0.1;

        // Start the note
        const startEvent: NoteEvent = {
            id: state.ambient.activeMelodyNoteId,
            part: 'melody', freq: startFreq,
            dur: melodyDuration, vel: 0.6, time: scheduledTime
        };
        self.postMessage({ type: 'playNote', note: startEvent });

        // Schedule the pitch bend
        const updateEvent: NoteUpdateEvent = {
            id: state.ambient.activeMelodyNoteId,
            part: 'melody',
            freq: endFreq,
            rampTime: melodyDuration,
        };
        self.postMessage({ type: 'updateNote', note: updateEvent });
    }
}


// --- "SEQUENCE" STYLE (Mike Oldfield inspired) ---
function tickSequence(time: number) {
    // Bass part (plays every 8 ticks = half note)
    if (state.tick16n % 16 === 0) { // Slower bass
        const bassFreq = state.scaleFrequencies.bass[state.sequence.bassNoteIndex % state.scaleFrequencies.bass.length];
        const event: NoteEvent = {
            part: 'bass', freq: bassFreq,
            dur: '1n', vel: 0.8, time
        };
        self.postMessage({ type: 'playNote', note: event });
        state.sequence.bassNoteIndex++;
    }

    // Accompaniment (plays every 4 ticks = quarter note arpeggio)
    if (state.tick16n % 8 === 0) { // Slower accompaniment
        const accompFreq = state.scaleFrequencies.accompaniment[state.sequence.accompanimentIndex % state.scaleFrequencies.accompaniment.length];
        const event: NoteEvent = {
            part: 'accompaniment', freq: accompFreq,
            dur: '4n', vel: 0.4, time
        };
        self.postMessage({ type: 'playNote', note: event });
        state.sequence.accompanimentIndex++;
        if (Math.random() < 0.05) { // Occasionally jump in the arpeggio
            state.sequence.accompanimentIndex += Math.floor(Math.random() * 4) - 2;
        }
    }

    // New Melodic Logic
    if (state.tick16n >= state.sequence.nextMelodyTick) {
        // Phrase finished, create a pause
        if (state.sequence.notesInCurrentPhrase >= state.sequence.maxNotesInPhrase) {
            state.sequence.notesInCurrentPhrase = 0;
            state.sequence.maxNotesInPhrase = 3 + Math.floor(Math.random() * 3); // 3-5 notes
            state.sequence.nextMelodyTick = state.tick16n + 8 + Math.floor(Math.random() * 16); // Pause for 2-6 beats
            return;
        }

        let nextNoteIndex;
        // If it's the first note, pick one from the middle of the scale
        if (state.sequence.lastMelodyNoteIndex === null) {
            nextNoteIndex = Math.floor(state.scaleFrequencies.melody.length / 2) + (Math.floor(Math.random()*4)-2);
        } else {
            // Stepwise motion: move 1 or 2 steps up or down the scale
            const step = (Math.random() < 0.2) ? 2 : 1; // 20% chance of a 2-step jump
            const direction = (Math.random() < 0.5) ? -1 : 1;
            nextNoteIndex = state.sequence.lastMelodyNoteIndex + (step * direction);
        }

        // Keep the note within the scale boundaries
        nextNoteIndex = Math.max(0, Math.min(state.scaleFrequencies.melody.length - 1, nextNoteIndex));
        
        const melodyFreq = state.scaleFrequencies.melody[nextNoteIndex];
        const event: NoteEvent = {
            part: 'melody', freq: melodyFreq,
            dur: '2n', vel: 0.7, time // Slower melody
        };
        self.postMessage({ type: 'playNote', note: event });
        
        // Update state
        state.sequence.lastMelodyNoteIndex = nextNoteIndex;
        state.sequence.notesInCurrentPhrase++;
        state.sequence.nextMelodyTick = state.tick16n + 8; // Next note is a half note away
    }
}


// --- MAIN TICK ROUTER ---
function tick(time: number) {
    if (!state.isRunning) return;

    switch(state.currentStyle) {
        case 'Ambient':
            tickAmbient(time);
            break;
        case 'Sequence':
            tickSequence(time);
            break;
    }
    
    // Increment master tick
    state.tick16n++;
}

// --- MESSAGE HANDLER ---
self.onmessage = function (event: MessageEvent<WorkerEvent>) {
    const { type, ...data } = event.data;
    switch (type) {
        case 'start':
            state.isRunning = true;
            state.tick16n = 0;
            // Reset sequence state
            state.sequence.bassNoteIndex = 0;
            state.sequence.accompanimentIndex = 0;
            state.sequence.lastMelodyNoteIndex = null;
            state.sequence.notesInCurrentPhrase = 0;
            state.sequence.maxNotesInPhrase = 5;
            state.sequence.nextMelodyTick = 0;
            // Reset ambient state
            state.ambient.currentChordDegree = 0;
            state.ambient.lastChordChangeTick = -Infinity; // Force immediate chord
            state.ambient.activeMelodyNoteId = null;
            break;
        case 'stop':
            state.isRunning = false;
            break;
        case 'tick':
            tick(data.time);
            break;
        case 'setTempo':
            // @ts-ignore
            state.currentBpm = data.bpm;
            break;
        case 'setHarmony':
            // @ts-ignore
            updateHarmony(data.key, data.scale);
            break;
        case 'setStyle':
            // @ts-ignore
            state.currentStyle = data.style;
            state.tick16n = 0; // Reset tick count on style change
            state.ambient.lastChordChangeTick = -Infinity; // Force immediate chord change on style switch
            state.ambient.activeMelodyNoteId = null;
            break;
        case 'setInstruments':
            // @ts-ignore
            state.instruments = data.instruments;
            break;
    }
};

// Initial setup
updateHarmony(state.currentKey, state.currentScale);

    

    