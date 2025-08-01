

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle, MelodyInstrument } from '@/app/page';
import type { WorkerEvent, WorkerResponse } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';


export class AutopilotEngine {
    public isInitialized = false;

    private audioEngine: AudioEngine;
    
    private worker?: Worker;
    private isAutopilotOn = false;
    private nextPatternTime = 0;
    private patternDuration = Tone.Time('4m').toSeconds();
    private scheduleId: number | null = null;
    
    private currentKey: MusicKey = 'C';
    private currentScale: MusicScale = 'Major Pentatonic';
    private currentStyle: AutopilotStyle = 'Ambient';
    private currentMelodyInstrument: MelodyInstrument = 'synth';
    private currentTempo: number = 120;

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
    }

    public async initialize() {
        if (this.isInitialized) return;
        
        if (typeof window !== 'undefined') {
            this.worker = new Worker(new URL('./autopilot-worker.ts', import.meta.url));
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
        }
        
        Tone.Transport.on('start', () => {
            if (this.isAutopilotOn) {
                this.stopCurrentLoop();
                this.startLoop();
            }
        });
        
        Tone.Transport.on('stop', () => {
            this.stopCurrentLoop();
        });

        this.isInitialized = true;
    }

     private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
        if (event.data.type === 'patternGenerated') {
            const { melodyEvents, bassEvents } = event.data;
            const allEvents = [...melodyEvents, ...bassEvents];

            allEvents.forEach((note) => {
                 this.audioEngine.playAutopilotNote(this.nextPatternTime + note.time, {
                    type: note.isBass ? 'bass' : 'melody',
                    freq: note.freq,
                    dur: note.dur,
                    vel: note.vel,
                });
            });
        }
    }
    
    private startLoop() {
        this.stopCurrentLoop();

        this.nextPatternTime = Tone.Time('@4m').toSeconds();
        this.postMessage({ type: 'generate' });
        
        this.scheduleId = Tone.Transport.scheduleRepeat(() => {
            this.nextPatternTime += this.patternDuration;
            this.postMessage({ type: 'generate' });
        }, this.patternDuration, this.nextPatternTime);
    }
    
    private stopCurrentLoop() {
        if (this.scheduleId !== null) {
            Tone.Transport.clear(this.scheduleId);
            this.scheduleId = null;
        }
    }


    private postMessage(message: WorkerEvent) {
        this.worker?.postMessage(message);
    }

    public setTempo(bpm: number) {
        this.currentTempo = bpm;
        this.postMessage({ type: 'setTempo', bpm: this.currentTempo });
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.currentKey = key;
        this.currentScale = scale;
        this.postMessage({ type: 'setHarmony', key, scale });
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;
        const wasOn = this.isAutopilotOn;
        this.isAutopilotOn = isOn;
        this.currentStyle = style;
        
        this.postMessage({ type: 'setStyle', style: this.currentStyle });

        if (isOn && !wasOn) {
            // Ensure worker has all current settings before starting
            this.postMessage({ type: 'setTempo', bpm: this.currentTempo });
            this.postMessage({ type: 'setHarmony', key: this.currentKey, scale: this.currentScale });
             if (Tone.Transport.state === 'started') {
                this.startLoop();
            }
        } else if (!isOn && wasOn) {
            this.stopCurrentLoop();
        }
    }

    public setMelodyInstrument(instrument: MelodyInstrument) {
        this.currentMelodyInstrument = instrument;
        this.audioEngine.setMelodyInstrument(instrument);
    }
}
