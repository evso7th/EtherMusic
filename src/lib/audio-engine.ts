
import * as Tone from 'tone';
import type { MelodyInstrument, MusicKey, MusicScale, Orb } from '@/app/page';

type ActiveNote = {
    type: 'melody' | 'bass';
    synth: Tone.Synth;
    initialFreq: number;
    x: number;
    y: number;
};

type LatchedBassNote = {
    id: number;
    x: number;
    y: number;
    synth: Tone.Synth;
    initialFreq: number;
    volume: number;
};

const NOTE_PROXIMITY_THRESHOLD = 35;


export class AudioEngine {
    public isInitialized = false;

    // --- Tone.js Objects ---
    private channels!: { melody: Tone.Channel, bass: Tone.Channel, drums: Tone.Channel };
    public fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };
    private melodySynths: Tone.Synth[] = [];
    private bassSynths: Tone.Synth[] = [];
    private latchSynths: Tone.PolySynth<Tone.Synth>;
    
    private drumSamplers: Record<string, Tone.Player> = {};
    private drumPart!: Tone.Part<{note: string | string[]}>;
    private conductorEventId: number | null = null;
    private measureCount = 0;
    private recorder!: Tone.Recorder;
    private bassLFO!: Tone.LFO;
    private currentBeatPatternName = 'Off';
    
    // --- Internal State ---
    private activeNotes = new Map<number, ActiveNote>();
    private latchedBassNotes = new Map<number, LatchedBassNote>();
    
    private allowedFrequencies = { bass: [] as number[], melody: [] as number[] };
    private isBassPulsating = false;
    private isBassLatchOn = false;
    private musicKey: MusicKey = 'C';
    private musicScale: MusicScale = 'Major Pentatonic';


    // --- PUBLIC API ---

    public async initialize() {
        if (this.isInitialized) return;

        try {
            await Tone.start();
        } catch (e) {
            console.error("Tone.start() failed:", e);
            return;
        }

        // Master FX
        this.fx = {
            reverb: new Tone.Reverb({ decay: 8, wet: 1 }).toDestination(),
            delay: new Tone.FeedbackDelay("8n", 0.5).toDestination(),
        };

        // Master Channels
        this.channels = {
            melody: new Tone.Channel(0).toDestination(),
            bass: new Tone.Channel(0).toDestination(),
            drums: new Tone.Channel(0).toDestination(),
        };
        this.connectChannelsToFX();
        
        // Synth Pools
        this.createSynthPools();
        
        // Latch-specific synth
        this.latchSynths = new Tone.PolySynth(Tone.Synth, {
             maxPolyphony: 2,
             voice: {
                 oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                 envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 0.8 },
             }
        }).connect(this.channels.bass);
        
        // Bass LFO for Latch Synths - Configured for a "heartbeat" effect
        this.bassLFO = new Tone.LFO({
            type: "square", // Creates a sharp on/off effect
            frequency: "2n", // Pulsates every half note by default
            min: -100,  // Go completely silent
            max: 0,          // Go to full volume (0 dB)
        }).start();

        // Drums
        await this.loadDrumSamples();
        this.setupDrumPart();
        
        // Conductor
        this.startConductor();
        
        // Recorder
        this.recorder = new Tone.Recorder();
        Tone.getDestination().connect(this.recorder);

        this.isInitialized = true;
    }

    public start() {
        if (!this.isInitialized || Tone.Transport.state === 'started') return;
        Tone.Transport.start();
        this.latchedBassNotes.forEach(note => {
            this.latchSynths.triggerAttack(note.initialFreq, undefined, note.volume);
        });
    }

    public pause() {
        if (!this.isInitialized) return;
        if (Tone.Transport.state === 'started') {
            Tone.Transport.pause();
        }
        this.latchSynths.releaseAll();
    }

    public stop() {
        if (!this.isInitialized) return;
        Tone.Transport.stop();
        
        // Stop real-time notes
        this.activeNotes.forEach(note => note.synth.triggerRelease());
        this.activeNotes.clear();
        
        // Stop latched notes
        this.latchSynths.releaseAll();
        
        this.updateAndDispatchOrbs();
    }
    
    public toggleRecording(): boolean {
        if (!this.isInitialized) return false;
        
        if (this.recorder.state === 'stopped') {
            this.recorder.start();
            return true;
        } else {
            this.recorder.stop().then(async (recording) => {
                const url = URL.createObjectURL(recording);
                const anchor = document.createElement("a");
                anchor.download = "ethermusic_recording.webm";
                anchor.href = url;
                anchor.click();
            });
            return false;
        }
    }

    // --- Setters for UI State ---

    public setTempo(bpm: number) {
        if (!this.isInitialized) return;
        Tone.Transport.bpm.value = bpm;
        if (this.bassLFO) {
            this.bassLFO.frequency.value = Tone.Time("2n").toFrequency();
        }
    }

    public setVolumes(volumes: Record<string, number>) {
        if (!this.isInitialized || !this.channels) return;
        this.channels.melody.volume.value = volumes.melody;
        this.channels.bass.volume.value = volumes.bass; // This affects both regular and latched bass synths
        this.channels.drums.volume.value = volumes.drums;
    }

    public setEffects(effects: Record<string, { reverb: number, delay: number }>) {
        if (!this.isInitialized || !this.channels) return;
        this.channels.melody.send('reverb', effects.melody.reverb);
        this.channels.melody.send('delay', effects.melody.delay);
        this.channels.bass.send('reverb', effects.bass.reverb);
        this.channels.bass.send('delay', effects.bass.delay);
        this.channels.drums.send('reverb', effects.drums.reverb);
        this.channels.drums.send('delay', effects.drums.delay);
    }
    
    public setBeatPattern(patternName: string) {
        if (!this.isInitialized) return;
        this.currentBeatPatternName = patternName;
        this.measureCount = 0;
        this.updateDrumAndConductor(patternName);
    }
    
    public setMelodyInstrument(instrument: MelodyInstrument) {
        if (!this.isInitialized) return;
        let newOptions;
        switch (instrument) {
            case 'organ':
                newOptions = {
                     oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                     envelope: { attack: 0.05, decay: 0.3, sustain: 0.9, release: 0.8 },
                };
                break;
            case 'theremin':
                newOptions = {
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 },
                };
                break;
            case 'glass':
                newOptions = {
                     oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 },
                     envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.2 },
                };
                break;
            case 'synth':
            default:
                 newOptions = {
                    oscillator: { type: 'fatsine4', spread: 40, count: 4 },
                    envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 },
                };
                break;
        }
        this.melodySynths.forEach(synth => synth.set(newOptions));
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        if (!this.isInitialized) return;
        this.musicKey = key;
        this.musicScale = scale;
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [3, 4, 5]),
        };
    }

    public setBassPulsating(isPulsating: boolean) {
        if (!this.isInitialized || !this.bassLFO) return;
        this.isBassPulsating = isPulsating;
    
        if (isPulsating) {
            this.bassLFO.connect(this.latchSynths.volume);
        } else {
            this.bassLFO.disconnect(this.latchSynths.volume);
            this.latchSynths.volume.cancelScheduledValues();
            this.latchSynths.volume.rampTo(0, 0.1); 
        }
    }

    public setBassLatch(isLatchOn: boolean) {
        if (!this.isInitialized) return;
        this.isBassLatchOn = isLatchOn;
        if (!isLatchOn && this.latchedBassNotes.size > 0) {
            this.latchSynths.releaseAll();
            this.latchedBassNotes.clear();
            this.updateAndDispatchOrbs();
        }
    }

    // --- Theremin Interaction ---

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        if (type === 'bass' && this.isBassLatchOn) {
            this.handleLatchInteraction(pos, vol, freq);
            return;
        }

        const synthPool = type === 'melody' ? this.melodySynths : this.bassSynths;
        const activeSynths = new Set(Array.from(this.activeNotes.values()).map(n => n.synth));
        const freeSynth = synthPool.find(s => !activeSynths.has(s));

        if (freeSynth) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            const velocity = vol * vol;
            freeSynth.triggerAttack(quantizedFreq, undefined, velocity);
            this.activeNotes.set(pointerId, { type, synth: freeSynth, initialFreq: quantizedFreq, x: pos.x, y: pos.y });
            this.updateAndDispatchOrbs();
        }
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const activeNote = this.activeNotes.get(pointerId);
        
        if (activeNote) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            activeNote.synth.frequency.rampTo(quantizedFreq, 0.01);
            
            const velocity = vol * vol;
            if (activeNote.type === 'bass' && activeNote.synth.output.gain) {
                 activeNote.synth.output.gain.rampTo(velocity, 0.01);
            } else {
                 activeNote.synth.set({volume: Tone.gainToDb(velocity)});
            }
    
            activeNote.x = pos.x;
            activeNote.y = pos.y;
            this.updateAndDispatchOrbs();
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        if (this.isBassLatchOn && type === 'bass') {
            return;
        }

        const activeNote = this.activeNotes.get(pointerId);
        if (activeNote) {
            activeNote.synth.triggerRelease();
            this.activeNotes.delete(pointerId);
            this.updateAndDispatchOrbs();
        }
    }

    // --- PRIVATE METHODS ---

    private connectChannelsToFX() {
        Object.values(this.channels).forEach(channel => {
            channel.connect(this.fx.reverb);
            channel.connect(this.fx.delay);
        });
    }
    
    private createSynthPools() {
        const bassSynthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        } as const;
        
        const bassGain = new Tone.Gain(1).connect(this.channels.bass);

        for (let i = 0; i < 2; i++) {
            const synth = new Tone.Synth(bassSynthOptions);
            synth.output.gain = new Tone.Gain(1).connect(bassGain);
            this.bassSynths.push(synth);
        }

        const melodySynthOptions = { 
            portamento: 0.02,
        };
        for (let i = 0; i < 4; i++) {
            this.melodySynths.push(new Tone.Synth(melodySynthOptions).connect(this.channels.melody));
        }
    }

    private async loadDrumSamples() {
        const drumUrls = {
            C1: "/assets/sounds/kick drum.wav", D1: "/assets/sounds/snare.wav", E1: "/assets/sounds/closed hi hat accented.wav",
            E2: "/assets/sounds/closed hi hat ghost.wav", F1: "/assets/sounds/crash.wav", G1: "/assets/sounds/high tom.wav",
            G2: "/assets/sounds/mid tom.wav", G3: "/assets/sounds/low tom.wav",
        };
        
        const loadingPromises = Object.entries(drumUrls).map(([note, url]) => {
            return new Promise<void>((resolve) => {
                const player = new Tone.Player(url).connect(this.channels.drums);
                if (note === 'E1' || note === 'E2') player.volume.value = -3;
                this.drumSamplers[note] = player;
                Tone.loaded().then(() => resolve());
            });
        });
        await Promise.all(loadingPromises);
    }

    private setupDrumPart() {
        this.drumPart = new Tone.Part((time, value) => {
            const playNote = (note: string) => {
               if (this.drumSamplers[note]?.loaded) {
                   this.drumSamplers[note].start(time);
               }
           }
           if (Array.isArray(value.note)) {
               value.note.forEach(playNote);
           } else if (value.note) {
               playNote(value.note);
           }
       }, []).start(0);
       this.drumPart.loop = true;
       this.drumPart.loopEnd = '1m';
    }
    
    private updateDrumAndConductor(patternName: string) {
        if (!this.drumPart) return;

        this.drumPart.clear();
        
        if (patternName === 'Off') {
            if (this.conductorEventId !== null) {
                Tone.Transport.clear(this.conductorEventId);
                this.conductorEventId = null;
            }
            return;
        }
        
        this.startConductor();
        this.scheduleNextDrumMeasure();
    }

    private startConductor() {
        if (this.conductorEventId === null) {
            this.conductorEventId = Tone.Transport.scheduleRepeat((time) => {
                Tone.Draw.schedule(() => {
                    this.scheduleNextDrumMeasure();
                }, time);
            }, '1m');
        }
    }
    
    private scheduleNextDrumMeasure() {
        if (this.currentBeatPatternName === 'Off') {
            this.drumPart.clear();
            return;
        }

        const currentPatternData = beatPatternsData[this.currentBeatPatternName];
        if (!currentPatternData || !currentPatternData.groove?.length) {
            this.drumPart.clear();
            return;
        }
    
        const { groove, fills } = currentPatternData;
        const isFillMeasure = (this.measureCount % 4) === 3 && fills && fills.length > 0;
        
        const patternToPlay = isFillMeasure
            ? fills[Math.floor(Math.random() * fills.length)]
            : groove[Math.floor(Math.random() * groove.length)];

        this.drumPart.clear();
        patternToPlay.forEach((notes, i) => {
            if (notes) {
                const noteTime = `0:${Math.floor(i/4)}:${i%4}`;
                this.drumPart.add(noteTime, { note: notes });
            }
        });

        this.measureCount++;
    }
    
    private getScaleFrequencies = (key: MusicKey, scale: MusicScale, octaves: number[]): number[] => {
        const scaleIntervals: { [key in MusicScale]: string[] } = {
            'Major': ['0', '2', '4', '5', '7', '9', '11'], 'Minor': ['0', '2', '3', '5', '7', '8', '10'],
            'Major Pentatonic': ['0', '2', '4', '7', '9'], 'Minor Pentatonic': ['0', '3', '5', '7', '10'],
        };
        let allFrequencies: number[] = [];
        const intervals = scaleIntervals[scale];
        octaves.forEach(octave => {
            intervals.forEach(interval => {
                const note = Tone.Frequency(key + octave).transpose(interval);
                allFrequencies.push(note.toFrequency());
            });
        });
        return allFrequencies.sort((a,b) => a - b);
    };

    private getClosestFrequency(targetFreq: number, type: 'bass' | 'melody'): number {
        const freqs = type === 'bass' ? this.allowedFrequencies.bass : this.allowedFrequencies.melody;
        if (freqs.length === 0) return targetFreq;
        return freqs.reduce((prev, curr) => (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev));
    }

    private handleLatchInteraction(pos: { x: number; y: number }, vol: number, freq: number) {
        const quantizedFreq = this.getClosestFrequency(freq, 'bass');
        
        let existingEntryId;
        for (const [id, note] of this.latchedBassNotes.entries()) {
            const distance = Math.sqrt(Math.pow(note.x - pos.x, 2) + Math.pow(note.y - pos.y, 2));
            if (distance < NOTE_PROXIMITY_THRESHOLD) {
                existingEntryId = id;
                break;
            }
        }

        if (existingEntryId !== undefined) {
            const noteToRelease = this.latchedBassNotes.get(existingEntryId);
            if (noteToRelease) {
                this.latchSynths.triggerRelease(noteToRelease.initialFreq);
            }
            this.latchedBassNotes.delete(existingEntryId);
        } else if (this.latchedBassNotes.size < 2) {
            const newId = Date.now();
            const velocity = vol * vol;
            this.latchSynths.triggerAttack(quantizedFreq, undefined, velocity);

            this.latchedBassNotes.set(newId, {
                id: newId,
                x: pos.x, y: pos.y,
                synth: this.bassSynths[0], // Placeholder, not used for sound
                initialFreq: quantizedFreq,
                volume: velocity
            });
        }
         this.updateAndDispatchOrbs();
    }

    private updateAndDispatchOrbs() {
        const activeOrbs = Array.from(this.activeNotes.entries()).map(([id, note]) => ({
            id: id,
            x: note.x,
            y: note.y,
            type: note.type,
        }));
        
        const latchedOrbs = Array.from(this.latchedBassNotes.values()).map(note => ({
            id: note.id,
            x: note.x,
            y: note.y,
            type: 'latch' as const,
        }));
        
        const allOrbs = [...activeOrbs, ...latchedOrbs];
        
        const bassOrbs = allOrbs.filter(orb => orb.type === 'bass' || orb.type === 'latch');
        const melodyOrbs = allOrbs.filter(orb => orb.type === 'melody');
        
        document.dispatchEvent(new CustomEvent('orbs-updated-bass', { detail: bassOrbs }));
        document.dispatchEvent(new CustomEvent('orbs-updated-melody', { detail: melodyOrbs }));
    }
}


const beatPatternsData: { [key: string]: { groove: (string|string[]|null)[][], fills: (string|string[]|null)[][] } } = {
    Air: {
        groove: [
            [
                null, 'E2', 'E1', 'E2', null, 'E1', 'E2', 'E1',
                null, null, 'E2', null, null, 'E1', null, 'E2',
            ],
        ],
        fills: [
            [
                null, 'F1', null, null, null, 'F1', null, null,
                'E1', null, 'E2', null, 'E1', null, 'E2', null
            ]
        ]
    },
    Earth: {
        groove: [
            [
                'C1', null, null, null, 'C1', null, null, null,
                'C1', null, null, null, 'C1', null, null, null,
            ],
        ],
        fills: [
            [
                null, 'G1', null, 'G2', null, 'G3', null, 'C1',
                null, 'E2', null, 'G3', null, 'G2', null, 'F1',
            ]
        ]
    },
    Water: {
        groove: [
            [
                null, 'E2', 'E1', 'E2', null, 'E2', 'E1', 'E2',
                null, 'E2', null, 'E2', 'E1', 'E2', 'F1', null,
            ]
        ],
        fills: [
            [
                'F1', 'E1', null, 'E2', 'F1', null, 'F1', 'E2',
                null, 'E1', 'F1', null, 'F1', 'E1', null, 'F1',
            ]
        ]
    },
    Tibet: {
        groove: [
            [
                'C1', null, null, null, null, 'D1', null, null,
                null, 'C1', null, null, null, null, null, null,
            ]
        ],
        fills: [
            [
                'D1', null, null, null, null, 'C1', null, null,
                null, null, 'C1', null, null, null, 'D1', null,
            ]
        ]
    },
    Toccata: {
        groove: [[
            ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2', ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2',
            ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2', ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2'
        ]],
        fills: [
            [
                'G1', 'G1', 'G2', 'G2', 'G3', 'G3', ['F1', 'C1'], ['F1'],
                'G1', 'G2', 'G3', null, 'F1', 'D1', ['F1', 'C1'], ['F1', 'D1'],
            ],
            [
                'G1', 'E2', 'G1', 'E2', 'G2', 'E2', 'G2', 'E2',
                'G3', 'E2', 'G3', 'E1', ['F1', 'D1'], 'C1', ['F1', 'C1'], 'C1'
            ]
        ]
    },
    Promenade: {
        groove: [[
            ['C1', 'E2'], 'E2', ['C1', 'E2'], 'E2', ['C1', 'E2'], 'E2', ['C1', 'E2'], 'E2',
            ['C1', 'E2'], 'E2', ['C1', 'E2'], 'E2', ['C1', 'E2'], 'E2', ['C1', 'E2'], 'E2',
        ]],
        fills: [
            [
                'C1', 'E2', ['C1', 'E2'], 'E2', 'C1', 'E2', ['C1', 'E2'], 'E2',
                'D1', 'E2', ['D1', 'E2'], 'E2', 'D1', 'E2', ['D1', 'E2', 'F1'], 'F1',
            ]
        ]
    },
    Nocturne: {
        groove: [[
            'C1', ['E1', 'E2'], 'E2', ['E1', 'E2'], 'C1', ['E1', 'E2'], 'E2', ['E1', 'E2'],
            'C1', ['E1', 'E2'], 'E2', ['E1', 'E2'], 'C1', ['E1', 'E2'], 'E2', ['E1', 'E2'],
        ]],
        fills: [
            [
                'E2', 'E2', 'E2', 'E2', 'E2', 'E2', 'E2', 'E2',
                'E1', 'E1', 'E1', 'E1', 'E1', 'E1', 'E1', 'E1',
            ]
        ]
    },
    Scherzo: {
        groove: [[
            null, ['E1', 'E2'], ['C1','D1'], 'E2', null, ['E1', 'E2'], ['C1','D1'], 'E2',
            null, ['E1', 'E2'], ['C1','D1'], 'E2', null, ['E1', 'E2'], ['C1','D1'], 'E2',
        ]],
        fills: [
            [
                'G1', null, 'G2', null, 'G3', null, ['C1','D1'], null,
                'G1', 'G1', 'G2', 'G2', 'G3', 'G3', ['C1', 'D1', 'F1'], null,
            ]
        ]
    },
    Aria: {
        groove: [[
            ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1', ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1',
            ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1', ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1',
        ]],
        fills: [
            [
                'G1', null, 'G1', 'G2', null, 'G2', 'G3', null,
                'G3', ['D1', 'G3'], 'D1', 'D1', ['F1', 'D1'], 'C1', 'D1', 'C1'
            ]
        ]
    },
    Off: {
        groove: [],
        fills: []
    }
};
