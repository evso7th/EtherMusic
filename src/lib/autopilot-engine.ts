

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle, MelodyInstrument } from '@/app/page';
import type { WorkerEvent, WorkerResponse } from './autopilot-worker';
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
        
        // Listen to transport start/stop to sync the worker's clock
        Tone.Transport.on('start', () => {
            if (this.isAutopilotOn) {
                this.postMessage({ type: 'start' });
            }
        });
        
        Tone.Transport.on('stop', () => {
            this.postMessage({ type: 'stop' });
            this.audioEngine.stopAutopilotSynths();
        });

        this.isInitialized = true;
    }

    private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
        if (event.data.type === 'playNote') {
            this.audioEngine.playAutopilotEvent(event.data.note);
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
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;
        
        this.isAutopilotOn = isOn;
        this.postMessage({ type: 'setStyle', style: style });

        if (isOn) {
            // If transport is already running, start the worker's clock immediately.
            // Otherwise, the 'start' event on the transport will handle it.
            if (Tone.Transport.state === 'started') {
                 this.postMessage({ type: 'start' });
            }
        } else {
            this.postMessage({ type: 'stop' });
            this.audioEngine.stopAutopilotSynths();
        }
    }

    public setMelodyInstrument(instrument: MelodyInstrument) {
        if (!this.isInitialized) return;
        this.audioEngine.setMelodyInstrument(instrument);
    }
}
