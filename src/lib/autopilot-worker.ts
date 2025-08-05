

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';
import type { Unit } from 'tone/build/esm/core/type/Units';

// --- TYPE DEFINITIONS ---
export type AutopilotStyle = 'Ambient' | 'Sequence' | 'Water' | 'Air';
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
    | { type: 'updateNote', note: NoteUpdateEvent }
    | { type: 'playNotesBatch', notes: NoteEvent[] };


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
        effects: 'Starfall' as Instrument
    },
    scaleFrequencies: {
        bass: [] as number[],
        accompaniment: [] as number[],
        melody: [] as number[],
        effects: [] as number[],
    },
    // Style-specific state
    ambient: {
        chordProgression: [0, 4, 5, 3], // I-V-vi-IV in 0-based scale degrees
        currentChordDegree: 0,
        lastChordChangeTick: -Infinity,
        lastMelodyDegree: null as number | null,
    },
    sequence: {
        bassNoteIndex: 0,
        accompanimentIndex: 0,
        lastMelodyNoteIndex: null as number | null,
        notesInCurrentPhrase: 0,
        maxNotesInPhrase: 5,
        nextMelodyTick: 0,
    },
    water: {
        arpeggioIndex: 0,
        currentChordRootDegree: 0,
    },
    air: {
        currentChordIndex: 0,
        phraseMeasures: 0,
        totalPhraseMeasures: 4,
        isResting: false,
        restMeasures: 0,
        totalRestMeasures: 2,
        currentArpPattern: [0, 1, 2],
    }
};

function updateHarmony(key: MusicKey, scale: MusicScale) {
    state.currentKey = key;
    state.currentScale = scale;
    state.scaleFrequencies = {
        bass: getScaleFrequencies(key, scale, [2, 3]),
        accompaniment: getScaleFrequencies(key, scale, [3, 4]),
        melody: getScaleFrequencies(key, scale, [4, 5]),
        effects: getScaleFrequencies(key, scale, [5, 6]),
    };
    // Reset melody memory on harmony change
    state.sequence.lastMelodyNoteIndex = null;
    state.ambient.lastChordChangeTick = -Infinity;
    state.ambient.lastMelodyDegree = null;
    state.water.arpeggioIndex = 0;
    // Reset air state on harmony change
    state.air.phraseMeasures = 0;
    state.air.isResting = false;
    state.air.restMeasures = 0;
}

// --- "AMBIENT" STYLE ---
function tickAmbient(time: number) {
    const ticksPerMeasure = 16;
    const ticksForChordChange = ticksPerMeasure * 2; // Chord changes every 2 measures for more movement

    // --- BASS (Drone) & ACCOMPANIMENT (Pads) ---
    if (state.tick16n % ticksForChordChange === 0) {
        state.ambient.currentChordDegree = (state.ambient.currentChordDegree + 1) % state.ambient.chordProgression.length;
        const scaleRootDegree = state.ambient.chordProgression[state.ambient.currentChordDegree];

        // Bass Drone
        const bassFreq = state.scaleFrequencies.bass[scaleRootDegree % state.scaleFrequencies.bass.length];
        if (bassFreq) {
            self.postMessage({ type: 'playNote', note: {
                part: 'bass', freq: bassFreq, dur: '2m', vel: 0.6, time
            }});
        }

        // Accompaniment Chord (Pad) - 3 notes
        const chordDegrees = [scaleRootDegree, scaleRootDegree + 2, scaleRootDegree + 4];
        chordDegrees.forEach((degree, index) => {
            const noteFreq = state.scaleFrequencies.accompaniment[degree % state.scaleFrequencies.accompaniment.length];
            if (noteFreq) {
                self.postMessage({ type: 'playNote', note: {
                    part: 'accompaniment', freq: noteFreq, dur: '1m', vel: 0.3 + (Math.random() * 0.1), time: time + (index * 0.1)
                }});
            }
        });
    }

    // --- MELODY ---
    // Play a new note every measure
    if (state.tick16n % ticksPerMeasure === 0) {
        let nextMelodyDegree;
        if (state.ambient.lastMelodyDegree === null) {
            nextMelodyDegree = Math.floor(Math.random() * state.scaleFrequencies.melody.length);
        } else {
            // Stepwise motion
            const direction = Math.random() > 0.5 ? 1 : -1;
            nextMelodyDegree = state.ambient.lastMelodyDegree + direction;
            // Boundary check
            if (nextMelodyDegree < 0 || nextMelodyDegree >= state.scaleFrequencies.melody.length) {
                nextMelodyDegree = state.ambient.lastMelodyDegree - direction; // Go the other way
            }
        }

        const melodyFreq = state.scaleFrequencies.melody[nextMelodyDegree];
        if (melodyFreq) {
            const noteEvent: NoteEvent = {
                part: 'melody',
                freq: melodyFreq,
                dur: '1m',
                vel: 0.7,
                time: time,
            };
            self.postMessage({ type: 'playNote', note: noteEvent });
        }
        state.ambient.lastMelodyDegree = nextMelodyDegree;
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

// --- "WATER" STYLE ---
function tickWater(time: number) {
    const ticksPerMeasure = 16;
    const ticksForChordChange = ticksPerMeasure * 2;

    // Change chord root every 2 measures
    if (state.tick16n % ticksForChordChange === 0) {
        state.water.currentChordRootDegree = Math.floor(Math.random() * state.scaleFrequencies.bass.length);
    }
    
    // Play bass note at the start of each chord change
    if (state.tick16n % ticksForChordChange === 0) {
        const bassFreq = state.scaleFrequencies.bass[state.water.currentChordRootDegree];
        if (bassFreq) {
             self.postMessage({ type: 'playNote', note: {
                part: 'bass', freq: bassFreq, dur: '2m', vel: 0.5, time
            }});
        }
    }

    // Play melody "drop" note randomly
    if (state.tick16n % 4 === 0 && Math.random() < 0.25) {
        const melodyFreq = state.scaleFrequencies.melody[Math.floor(Math.random() * state.scaleFrequencies.melody.length)];
         if (melodyFreq) {
             self.postMessage({ type: 'playNote', note: {
                part: 'melody', freq: melodyFreq, dur: '8n', vel: 0.8, time
            }});
        }
    }

    // Accompaniment arpeggio - BATCHED
    if (state.tick16n % ticksPerMeasure === 0) {
        const chordDegrees = [
            state.water.currentChordRootDegree,
            state.water.currentChordRootDegree + 2,
            state.water.currentChordRootDegree + 4,
            state.water.currentChordRootDegree + 2,
        ];
        
        const arpeggioPattern = [0, 1, 2, 3, 0, 2, 1, 3, 0, 3, 1, 2, 0, 1, 3, 2];
        const notesBatch: NoteEvent[] = [];

        for (let i = 0; i < 16; i++) {
            const patternIndex = arpeggioPattern[i];
            const degree = chordDegrees[patternIndex % chordDegrees.length];
            const noteFreq = state.scaleFrequencies.accompaniment[degree % state.scaleFrequencies.accompaniment.length];
            
            if (noteFreq) {
                const noteTime = time + (i * (60 / state.currentBpm / 4)); // time of the current 16th note
                notesBatch.push({
                    part: 'accompaniment',
                    freq: noteFreq,
                    dur: '16n',
                    vel: 0.3 + (Math.random() * 0.2),
                    time: noteTime,
                });
            }
        }
        if (notesBatch.length > 0) {
            self.postMessage({ type: 'playNotesBatch', notes: notesBatch });
        }
    }
}

// --- "AIR" STYLE ---
function tickAir(time: number) {
    const ticksPerMeasure = 16;
    const ticksPerBeat = 4;
    const chordProgression = [0, 3, 4, 0]; // I-IV-V-I
    const arpeggioPatterns = [ [0, 1, 2], [2, 1, 0], [0, 2, 1], [1, 2, 0] ];

    const notesBatch: NoteEvent[] = [];
    
    // --- PHRASING LOGIC ---
    if (state.tick16n % (ticksPerMeasure) === 0) {
        if (state.air.isResting) {
            state.air.restMeasures++;
            if (state.air.restMeasures >= state.air.totalRestMeasures) {
                state.air.isResting = false;
                state.air.phraseMeasures = 0;
                state.air.totalPhraseMeasures = 2 + Math.floor(Math.random() * 3); // Play for 2-4 measures
                 state.air.currentArpPattern = arpeggioPatterns[Math.floor(Math.random() * arpeggioPatterns.length)];
            }
        } else {
            state.air.phraseMeasures++;
            if (state.air.phraseMeasures >= state.air.totalPhraseMeasures) {
                state.air.isResting = true;
                state.air.restMeasures = 0;
                state.air.totalRestMeasures = 1 + Math.floor(Math.random() * 2); // Rest for 1-2 measures
            }
        }
    }

    // --- CHORD, BASS & ACCOMPANIMENT LOGIC ---
    if (state.tick16n % (ticksPerMeasure * 2) === 0) { // Slower chord changes
        state.air.currentChordIndex = (state.air.currentChordIndex + 1) % chordProgression.length;

        // BASS - Pulsing root note on every beat
        const bassRootDegree = chordProgression[state.air.currentChordIndex];
        const bassFreq = state.scaleFrequencies.bass[bassRootDegree % state.scaleFrequencies.bass.length];
        if (bassFreq) {
            for (let i=0; i < 8; i++) { // Every half measure for 2 measures
                 notesBatch.push({
                    part: 'bass',
                    freq: bassFreq,
                    dur: '8n',
                    vel: 0.6,
                    time: time + (i * ticksPerBeat * 2 * (60 / state.currentBpm / 4))
                });
            }
        }

        // ACCOMPANIMENT - Held pad
        const accompRootDegree = chordProgression[state.air.currentChordIndex];
        const chordDegrees = [accompRootDegree, accompRootDegree + 2, accompRootDegree + 4];
        chordDegrees.forEach((degree, index) => {
            const noteFreq = state.scaleFrequencies.accompaniment[degree % state.scaleFrequencies.accompaniment.length];
            if (noteFreq) {
                notesBatch.push({
                    part: 'accompaniment',
                    freq: noteFreq,
                    dur: '2m', // Held for two measures
                    vel: 0.35,
                    time: time + (index * 0.05) // Slight flame
                });
            }
        });
    }

    // --- MELODY LOGIC (only play if not resting) ---
    if (!state.air.isResting && state.tick16n % ticksPerBeat === 0) {
        const rootDegree = chordProgression[state.air.currentChordIndex];
        const triadDegrees = [rootDegree, rootDegree + 2, rootDegree + 4];

        // Pick one note from the triad based on the current arpeggio pattern
        const patternIndex = (state.tick16n / ticksPerBeat) % state.air.currentArpPattern.length;
        const triadNoteIndex = state.air.currentArpPattern[patternIndex];
        const noteDegree = triadDegrees[triadNoteIndex];

        const melodyFreq = state.scaleFrequencies.melody[noteDegree % state.scaleFrequencies.melody.length];

        if (melodyFreq) {
            notesBatch.push({
                part: 'melody',
                freq: melodyFreq,
                dur: '8n',
                vel: 0.7,
                time: time,
            });
        }
    }

    if (notesBatch.length > 0) {
        self.postMessage({ type: 'playNotesBatch', notes: notesBatch });
    }
}



// --- UNIVERSAL EFFECTS TICK ---
function tickEffects(time: number) {
    if (Math.random() < 0.05) { // Lower probability for less frequent effects
        const freq = state.scaleFrequencies.effects[Math.floor(Math.random() * state.scaleFrequencies.effects.length)];
        const event: NoteEvent = {
            part: 'effects',
            freq: freq,
            dur: '4n',
            vel: 0.5 + Math.random() * 0.3,
            time: time,
        };
        self.postMessage({ type: 'playNote', note: event });
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
        case 'Water':
            tickWater(time);
            break;
        case 'Air':
            tickAir(time);
            break;
    }

    tickEffects(time);
    
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
            state.ambient.lastMelodyDegree = null;
            // Reset water state
            state.water.arpeggioIndex = 0;
            state.water.currentChordRootDegree = 0;
            // Reset Air state
            state.air.currentChordIndex = 0;
            state.air.phraseMeasures = 0;
            state.air.totalPhraseMeasures = 4;
            state.air.isResting = true; // Start with a rest
            state.air.restMeasures = 0;
            state.air.totalRestMeasures = 0; // No rest at the very beginning
            state.air.currentArpPattern = [0, 1, 2];

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
            state.ambient.lastMelodyDegree = null; // Reset melody on style change
            break;
        case 'setInstruments':
            // @ts-ignore
            state.instruments = data.instruments;
            break;
    }
};

// Initial setup
updateHarmony(state.currentKey, state.currentScale);

    
