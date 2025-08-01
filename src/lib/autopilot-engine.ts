

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle, MelodyInstrument } from '@/app/page';
import type { WorkerEvent, WorkerResponse, NoteEventWithType } from './autopilot-worker';
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
            const { melody, accompaniment, bass, effects } = event.data.pattern;

            // Combine all events to schedule them
            const allEvents: NoteEventWithType[] = [
                ...melody.map(n => ({ ...n, type: 'melody' as const })),
                ...accompaniment.map(n => ({ ...n, type: 'accompaniment' as const })),
                ...bass.map(n => ({ ...n, type: 'bass' as const })),
                ...effects.map(n => ({ ...n, type: 'effects' as const })),
            ];

            allEvents.forEach((note) => {
                // Here is the call to the audio engine
                this.audioEngine.playAutopilotEvent(this.nextPatternTime + note.time, note);
            });
        }
    }
    
    private startLoop() {
        this.stopCurrentLoop(); // Ensure no previous loops are running
    
        const generateAndScheduleNext = (time: number) => {
            // CRITICAL: Prevent scheduling in the past.
            // If the scheduled time has already passed, use the current time instead.
            this.nextPatternTime = Math.max(time, Tone.now());
            
            this.postMessage({ type: 'generate' });
            this.scheduleId = Tone.Transport.scheduleOnce(generateAndScheduleNext, `+${this.patternDuration}`);
        }
    
        // Schedule the very first generation to happen at the start of the next measure.
        const nextMeasureTime = Tone.Transport.nextSubdivision('1m');
        this.scheduleId = Tone.Transport.scheduleOnce(generateAndScheduleNext, nextMeasureTime);
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
            if (Tone.Transport.state === 'started') {
                this.startLoop();
            }
        } else if (!isOn && wasOn) {
            this.stopCurrentLoop();
        }
    }

    public setMelodyInstrument(instrument: MelodyInstrument) {
        if (!this.isInitialized) return;
        // NOTE: We are not passing instrument info to the worker. 
        // The AudioEngine handles applying the correct instrument sound.
        this.postMessage({ type: 'setMelodyInstrument', instrument });
    }
}
