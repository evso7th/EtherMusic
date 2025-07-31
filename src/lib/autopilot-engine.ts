
import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle, MelodyInstrument } from '@/app/page';
import type { WorkerEvent, WorkerResponse } from './autopilot-worker';

type NoteEvent = {
    time: number;
    freq: number;
    dur: number;
    vel: number;
};

export class AutopilotEngine {
    public isInitialized = false;

    private melodySynths: Tone.Synth[] = [];
    private bassSynths: Tone.Synth[] = [];
    private melodyPart?: Tone.Part;
    private bassPart?: Tone.Part;
    private channel!: Tone.Channel;
    
    private worker?: Worker;
    private isAutopilotOn = false;
    private nextPatternTime = 0;

    public async initialize(fxReverb: Tone.Reverb, fxDelay: Tone.FeedbackDelay) {
        if (this.isInitialized) return;

        this.channel = new Tone.Channel(0).toDestination();
        this.channel.connect(fxReverb);
        this.channel.connect(fxDelay);
        
        this.createSynthPools();
        
        this.worker = new Worker(new URL('./autopilot-worker.ts', import.meta.url));
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        
        this.initializeParts();

        Tone.Transport.on('start', () => {
            if (this.isAutopilotOn) {
                this.nextPatternTime = Tone.Transport.seconds;
                this.requestNextPattern();
            }
        });

        this.isInitialized = true;
    }
    
    private initializeParts() {
        this.melodyPart = new Tone.Part((time, note) => {
            const availableSynth = this.melodySynths.shift();
            if (availableSynth) {
                availableSynth.triggerAttackRelease(note.freq, note.dur, time, note.vel);
                this.melodySynths.push(availableSynth);
            }
        }, []).start(0);

        this.bassPart = new Tone.Part((time, note) => {
            const availableSynth = this.bassSynths.shift();
            if (availableSynth) {
                availableSynth.triggerAttackRelease(note.freq, note.dur, time, note.vel);
                this.bassSynths.push(availableSynth);
            }
        }, []).start(0);
    }
    
    private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
        if (event.data.type === 'patternGenerated') {
            const { melodyEvents, bassEvents } = event.data;
            
            // Schedule the received events at the correct time
            Tone.Transport.scheduleOnce(time => {
                this.melodyPart?.clear();
                this.bassPart?.clear();
                
                melodyEvents.forEach(e => this.melodyPart?.add(this.nextPatternTime + e.time, e));
                bassEvents.forEach(e => this.bassPart?.add(this.nextPatternTime + e.time, e));

                // Prepare for the next pattern
                this.nextPatternTime += Tone.Time('4m').toSeconds();
                this.requestNextPattern();

            }, this.nextPatternTime);
        }
    }
    
    private requestNextPattern() {
        if (this.isAutopilotOn && Tone.Transport.state === 'started') {
            this.postMessage({ type: 'generate' });
        }
    }

    private postMessage(message: WorkerEvent) {
        this.worker?.postMessage(message);
    }

    public setVolume(volume: number) {
        if (!this.isInitialized) return;
        this.channel.volume.value = volume;
    }

    public setEffects(effects: { reverb: number, delay: number }) {
        if (!this.isInitialized || !this.channel) return;
        this.channel.send('reverb', effects.reverb);
        this.channel.send('delay', effects.delay);
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.postMessage({ type: 'setHarmony', key, scale });
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;
        const wasOn = this.isAutopilotOn;
        this.isAutopilotOn = isOn;
        
        this.postMessage({ type: 'setStyle', style });

        if (isOn) {
            if (!wasOn && Tone.Transport.state === 'started') {
                this.nextPatternTime = Tone.Time('@4m').toSeconds(); // Schedule for the start of the next 4-measure block
                this.requestNextPattern();
            }
        } else {
            this.melodyPart?.clear();
            this.bassPart?.clear();
            this.melodySynths.forEach(s => s.triggerRelease());
            this.bassSynths.forEach(s => s.triggerRelease());
        }
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

    private createSynthPools() {
        const bassSynthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        };
        for (let i = 0; i < 2; i++) {
            const synth = new Tone.Synth(bassSynthOptions).connect(this.channel);
            this.bassSynths.push(synth);
        }

        const melodySynthOptions = {
            oscillator: { type: 'fatsine4', spread: 40, count: 4 },
            envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 },
        };
        for (let i = 0; i < 4; i++) {
            const synth = new Tone.Synth(melodySynthOptions).connect(this.channel);
            this.melodySynths.push(synth);
        }
    }
}
