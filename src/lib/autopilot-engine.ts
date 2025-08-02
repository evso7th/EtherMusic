

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';


export class AutopilotEngine {
    public isInitialized = false;

    private audioEngine: AudioEngine;
    private worker?: Worker;
    private isAutopilotOn = false;
    
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
                this.postMessage({ type: 'start' });
            }
        });
        
        Tone.Transport.on('stop', () => {
            this.postMessage({ type: 'stop' });
        });

        this.isInitialized = true;
    }

    private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
        if (event.data.type === 'playNote') {
            this.audioEngine.playAutopilotEvent(event.data.note, event.data.time);
        }
    }

    private postMessage(message: WorkerEvent) {
        this.worker?.postMessage(message);
    }

    public setTempo(bpm: number) {
        this.postMessage({ type: 'setTempo', bpm: bpm });
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.postMessage({ type: 'setHarmony', key, scale });
    }

    public setAutopilotParts(parts: Record<AutopilotPart, boolean>) {
        this.postMessage({ type: 'setParts', parts: parts });
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;
        
        this.isAutopilotOn = isOn;
        this.postMessage({ type: 'setStyle', style: style });

        if (isOn) {
            if (Tone.Transport.state === 'started') {
                 this.postMessage({ type: 'start' });
            }
        } else {
            this.postMessage({ type: 'stop' });
        }
    }
}
