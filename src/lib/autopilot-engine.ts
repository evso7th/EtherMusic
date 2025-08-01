

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
    private scheduleTimeoutId: number | null = null;
    
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
            const { melody, accompaniment, bass } = event.data.pattern;

            // Combine all events to schedule them
            const allEvents: NoteEventWithType[] = [
                ...melody.map(n => ({ ...n, type: 'melody' as const })),
                ...accompaniment.map(n => ({ ...n, type: 'accompaniment' as const })),
                ...bass.map(n => ({ ...n, type: 'bass' as const })),
            ];

            allEvents.forEach((note) => {
                // Here is the call to the audio engine
                this.audioEngine.playAutopilotEvent(this.nextPatternTime + note.time, note);
            });
        }
    }
    
    private startLoop() {
        this.stopCurrentLoop();
    
        const generateAndScheduleNext = () => {
            this.nextPatternTime = Tone.now(); // Always schedule from now
            this.postMessage({ type: 'generate' });
            
            this.scheduleTimeoutId = window.setTimeout(generateAndScheduleNext, this.patternDuration * 1000);
        }
    
        generateAndScheduleNext();
    }
    
    
    private stopCurrentLoop() {
        if (this.scheduleTimeoutId !== null) {
            clearTimeout(this.scheduleTimeoutId);
            this.scheduleTimeoutId = null;
        }
        this.audioEngine.stopAutopilotSynths();
    }


    private postMessage(message: WorkerEvent) {
        this.worker?.postMessage(message);
    }

    public setTempo(bpm: number) {
        this.currentTempo = bpm;
        this.patternDuration = Tone.Time('4m').toSeconds(); // Recalculate duration when tempo changes
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
        
        // Ensure old loop is stopped before making changes or starting a new one
        this.stopCurrentLoop();

        if (isOn) {
            this.postMessage({ type: 'setStyle', style: this.currentStyle });
            // If transport is already running, start the loop immediately.
            // Otherwise, the 'start' event on the transport will handle it.
            if (Tone.Transport.state === 'started') {
                this.startLoop();
            }
        }
    }

    public setMelodyInstrument(instrument: MelodyInstrument) {
        if (!this.isInitialized) return;
        this.audioEngine.setMelodyInstrument(instrument);
    }
}
