
import * as Tone from 'tone';
import { beatPatternsData, generateAutopilotPattern } from './music-engine';
import type { MelodyInstrument, MusicKey, MusicScale, AutopilotStyle, Orb } from '@/app/page';

type NoteEvent = {
    time: string;
    freq: number;
    dur: string;
    vel: number;
};

type ActiveNote = {
    type: 'melody' | 'bass';
    synth: Tone.Synth;
    initialFreq: number;
};

type LatchedBassNote = {
    x: number;
    y: number;
    synth: Tone.Synth;
    initialFreq: number;
};

const NOTE_PROXIMITY_THRESHOLD = 35;


export class AudioEngine {
    public isInitialized = false;

    // --- Tone.js Objects ---
    private channels!: { melody: Tone.Channel, bass: Tone.Channel, drums: Tone.Channel, autopilot: Tone.Channel };
    private fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };
    private melodySynths: Tone.Synth[] = [];
    private bassSynths: Tone.Synth[] = [];
    
    // Autopilot
    private autopilotSynths!: { bass: Tone.PolySynth, melody: Tone.PolySynth };
    private autopilotParts!: { bass: Tone.Part<NoteEvent>, melody: Tone.Part<NoteEvent> };
    
    private drumSamplers: Record<string, Tone.Player> = {};
    private drumPart!: Tone.Part<{note: string | string[]}>;
    private conductorEventId: number | null = null;
    private measureCount = 0;
    private recorder!: Tone.Recorder;
    private bassLFO!: Tone.LFO;
    private bassGain!: Tone.Gain;
    private currentBeatPatternName = 'Off';
    
    // --- Internal State ---
    private activeNotes = new Map<number, ActiveNote>();
    private latchedBassNotes = new Map<number, LatchedBassNote>();
    private orbs: Orb[] = [];
    
    private allowedFrequencies = { bass: [] as number[], melody: [] as number[] };
    private isBassPulsating = false;
    private isBassLatchOn = false;
    private isPlaying = false;
    private isAutopilotOn = false;
    private autopilotStyle: AutopilotStyle = 'Ambient';
    private musicKey: MusicKey = 'C';
    private musicScale: MusicScale = 'Major Pentatonic';


    // --- PUBLIC API ---

    /**
     * Initializes the entire audio engine. Must be called once.
     */
    public async initialize() {
        if (this.isInitialized) return;

        await Tone.start();

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
            autopilot: new Tone.Channel(0).toDestination(),
        };
        this.connectChannelsToFX();
        
        // Synth Pools
        this.bassGain = new Tone.Gain(1).connect(this.channels.bass);
        this.createSynthPools();
        
        // Autopilot Synths (Poly)
        this.autopilotSynths = {
            melody: new Tone.PolySynth(Tone.Synth, { maxPolyphony: 4 }).connect(this.channels.autopilot),
            bass: new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 2,
                oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
            }).connect(this.channels.autopilot)
        };
        
        // Bass LFO
        this.bassLFO = new Tone.LFO({
            frequency: Tone.Time("4n").toFrequency(),
            min: 0,
            max: 1,
        }).start();

        // Drums
        await this.loadDrumSamples();
        this.setupDrumPart();
        
        // Autopilot Parts
        this.setupAutopilotParts();

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
        this.isPlaying = true;
        if (this.isBassLatchOn) {
            this.latchedBassNotes.forEach(note => {
                note.synth.triggerAttack(note.initialFreq, undefined, note.synth.volume.value);
            });
        }
    }

    public pause() {
        if (!this.isInitialized || this.isAutopilotOn) return;
        Tone.Transport.pause();
        this.isPlaying = false;
        if (this.isBassLatchOn) {
            this.latchedBassNotes.forEach(note => note.synth.triggerRelease());
        }
    }

    public stop() {
        if (!this.isInitialized) return;
        Tone.Transport.stop();
        this.isPlaying = false;
        
        this.activeNotes.forEach(note => note.synth.triggerRelease());
        this.latchedBassNotes.forEach(note => note.synth.triggerRelease());
        
        this.autopilotSynths.melody.releaseAll();
        this.autopilotSynths.bass.releaseAll();

        this.activeNotes.clear();
        this.latchedBassNotes.clear();
        this.orbs = [];
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
            this.bassLFO.frequency.value = Tone.Time("4n").toFrequency();
        }
    }

    public setVolumes(volumes: Record<string, number>) {
        if (!this.isInitialized || !this.channels) return;
        this.channels.melody.volume.value = volumes.melody;
        this.channels.bass.volume.value = volumes.bass;
        this.channels.drums.volume.value = volumes.drums;
        this.channels.autopilot.volume.value = volumes.autopilot;
    }

    public setEffects(effects: Record<string, { reverb: number, delay: number }>) {
        if (!this.isInitialized || !this.channels) return;
        this.channels.melody.send('reverb', effects.melody.reverb);
        this.channels.melody.send('delay', effects.melody.delay);
        this.channels.bass.send('reverb', effects.bass.reverb);
        this.channels.bass.send('delay', effects.bass.delay);
        this.channels.drums.send('reverb', effects.drums.reverb);
        this.channels.drums.send('delay', effects.drums.delay);
        this.channels.autopilot.send('reverb', effects.autopilot.reverb);
        this.channels.autopilot.send('delay', effects.autopilot.delay);
    }
    
    public setBeatPattern(patternName: string) {
        if (!this.isInitialized) return;
        this.currentBeatPatternName = patternName;
        this.measureCount = 0; // Reset measure count on pattern change
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
        this.autopilotSynths.melody.set({voice: Tone.Synth, options: newOptions});
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        if (!this.isInitialized) return;
        this.musicKey = key;
        this.musicScale = scale;
        this.allowedFrequencies = {
            bass: this.getScaleFrequencies(key, scale, [2, 3]),
            melody: this.getScaleFrequencies(key, scale, [3, 4, 5]),
        };
        // If an autopilot is on, regenerate patterns with new harmony
        if (this.isAutopilotOn) {
            this.regenerateAutopilotPatterns();
        }
    }

    public setBassPulsating(isPulsating: boolean) {
        if (!this.isInitialized || !this.bassLFO || !this.bassGain) return;
        this.isBassPulsating = isPulsating;
        if (isPulsating && this.isPlaying) {
            this.bassLFO.connect(this.bassGain.gain);
        } else {
            if (this.bassLFO.state === 'started') {
                 this.bassLFO.disconnect(this.bassGain.gain);
            }
            this.bassGain.gain.cancelScheduledValues();
            this.bassGain.gain.rampTo(1, 0.1); 
        }
    }

    public setBassLatch(isLatchOn: boolean) {
        if (!this.isInitialized) return;
        this.isBassLatchOn = isLatchOn;
        if (!isLatchOn && this.latchedBassNotes.size > 0) {
            this.latchedBassNotes.forEach(note => note.synth.triggerRelease());
            this.latchedBassNotes.clear();
            this.updateOrbs();
        }
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;
        this.isAutopilotOn = isOn;
        this.autopilotStyle = style;
        
        if (isOn) {
            this.regenerateAutopilotPatterns();
            this.autopilotParts.bass.start(0);
            this.autopilotParts.melody.start(0);
            if (Tone.Transport.state !== 'started') this.start();
        } else {
            this.autopilotParts.bass.stop(0).clear();
            this.autopilotParts.melody.stop(0).clear();
            this.autopilotSynths.bass.releaseAll();
            this.autopilotSynths.melody.releaseAll();
            if (Tone.Transport.state === 'started') this.pause();
        }
    }


    // --- Theremin Interaction ---

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}): Orb[] | undefined {
        if (type === 'bass' && this.isBassLatchOn) {
            this.handleLatchInteraction(pos);
        } else {
            const synthPool = type === 'melody' ? this.melodySynths : this.bassSynths;
            const activeSynths = new Set(Array.from(this.activeNotes.values()).map(n => n.synth));
            const freeSynth = synthPool.find(s => !activeSynths.has(s) && !Array.from(this.latchedBassNotes.values()).some(n => n.synth === s));

            if (freeSynth) {
                const quantizedFreq = this.getClosestFrequency(freq, type);
                freeSynth.frequency.value = quantizedFreq;
                freeSynth.volume.value = Tone.gainToDb(vol * vol);
                freeSynth.triggerAttack(quantizedFreq);
                this.activeNotes.set(pointerId, { type, synth: freeSynth, initialFreq: quantizedFreq });
            }
        }
        return this.updateOrbs();
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const activeNote = this.activeNotes.get(pointerId);
        if (activeNote) {
            const quantizedFreq = this.getClosestFrequency(freq, type);
            activeNote.synth.frequency.rampTo(quantizedFreq, 0.01);
            activeNote.synth.volume.value = Tone.gainToDb(vol * vol);
            // Orb position is updated in the React component to avoid returning new orb array on every move event
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number, pos: {x: number, y: number}): Orb[] | undefined {
        if (this.isBassLatchOn && type === 'bass') {
            // Latch notes are stopped in handleLatchInteraction on 'down' event
            return this.orbs;
        }

        const activeNote = this.activeNotes.get(pointerId);
        if (activeNote) {
            activeNote.synth.triggerRelease();
            this.activeNotes.delete(pointerId);
        }
        return this.updateOrbs();
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
            portamento: 0.02,
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        };
        // Player bass synths
        for (let i = 0; i < 2; i++) {
            this.bassSynths.push(new Tone.Synth(bassSynthOptions).connect(this.bassGain));
        }

        const melodySynthOptions = { portamento: 0.02 };
        // Player melody synths
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

    private setupAutopilotParts() {
        this.autopilotParts = {
            bass: new Tone.Part((time, note) => {
                this.autopilotSynths.bass?.triggerAttackRelease(note.freq, note.dur, time, note.vel);
            }, []).start(0),
            melody: new Tone.Part((time, note) => {
                this.autopilotSynths.melody?.triggerAttackRelease(note.freq, note.dur, time, note.vel);
            }, []).start(0)
        };
        this.autopilotParts.bass.loop = true;
        this.autopilotParts.bass.loopEnd = '4m';
        this.autopilotParts.melody.loop = true;
        this.autopilotParts.melody.loopEnd = '4m';
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
        
        // Always run conductor if a pattern is selected
        this.startConductor();
        
        // Immediately schedule the first measure
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
    
    private regenerateAutopilotPatterns() {
        if (!this.isInitialized || !this.autopilotParts.bass || !this.autopilotParts.melody) return;
        
        this.autopilotParts.bass.clear();
        this.autopilotParts.melody.clear();

        if (this.allowedFrequencies.bass.length === 0 || this.allowedFrequencies.melody.length === 0) return;

        const { bassPattern, melodyPattern } = generateAutopilotPattern(
            this.autopilotStyle,
            this.allowedFrequencies
        );

        bassPattern.forEach(note => this.autopilotParts.bass.add(note.time, note));
        melodyPattern.forEach(note => this.autopilotParts.melody.add(note.time, note));
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

    private handleLatchInteraction(pos: { x: number; y: number }) {
        let existingEntryKey;
        for (const [key, note] of this.latchedBassNotes.entries()) {
            const distance = Math.sqrt(Math.pow(note.x - pos.x, 2) + Math.pow(note.y - pos.y, 2));
            if (distance < NOTE_PROXIMITY_THRESHOLD) {
                existingEntryKey = key;
                break;
            }
        }

        if (existingEntryKey !== undefined) {
            const noteToRelease = this.latchedBassNotes.get(existingEntryKey);
            noteToRelease?.synth.triggerRelease();
            this.latchedBassNotes.delete(existingEntryKey);
        } else if (this.latchedBassNotes.size < this.bassSynths.length) {
            const assignedSynth = this.bassSynths.find(s => 
                !Array.from(this.latchedBassNotes.values()).some(n => n.synth === s) && 
                !Array.from(this.activeNotes.values()).some(n => n.synth === s)
            );
            if (assignedSynth) {
                const newKey = Date.now();
                if(this.allowedFrequencies.bass.length === 0) return;
                const quantizedFreq = this.allowedFrequencies.bass[Math.floor(Math.random() * this.allowedFrequencies.bass.length)];
                
                assignedSynth.frequency.value = quantizedFreq;
                if (this.isPlaying) {
                    assignedSynth.triggerAttack(quantizedFreq);
                }
                this.latchedBassNotes.set(newKey, { x: pos.x, y: pos.y, synth: assignedSynth, initialFreq: quantizedFreq });
            }
        }
    }

    private updateOrbs(): Orb[] {
        const activeOrbs = Array.from(this.activeNotes.entries()).map(([id, note]) => ({
            id: id,
            // x, y positions are managed by the component state for move events
            // We just provide the initial creation/deletion info
            x: 0, 
            y: 0,
            type: note.type
        }));
        const latchedOrbs = Array.from(this.latchedBassNotes.entries()).map(([id, note]) => ({
            id: id,
            x: note.x,
            y: note.y,
            type: 'latch' as const
        }));
        
        // This logic is flawed because x/y are not tracked here.
        // The UI component is now responsible for orb positions.
        // This method should just return the current structure.
        this.orbs = [...activeOrbs, ...latchedOrbs];
        return this.orbs;
    }
}
