
import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

// A map to hold the worker instances
const styleWorkerMap: Partial<Record<AutopilotStyle, Worker>> = {};

export class AutopilotEngine {
    public isInitialized = false;

    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private currentStyle: AutopilotStyle | null = null;
    private isAutopilotOn = false;

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
    }

    public async initialize() {
        if (this.isInitialized) return;
        
        if (typeof window !== 'undefined') {
            // Pre-warm the default worker
            this.getWorker('Ambient');
        }
        
        Tone.Transport.on('start', this.handleTransportStart.bind(this));
        Tone.Transport.on('stop', this.handleTransportStop.bind(this));

        this.isInitialized = true;
    }

    private getWorker(style: AutopilotStyle): Worker {
        if (styleWorkerMap[style]) {
            return styleWorkerMap[style]!;
        }

        console.log(`Creating worker for style: ${style}`);
        // For now, all styles use the same worker file.
        // This will be replaced with style-specific worker files.
        const worker = new Worker(new URL('./autopilot-worker.ts', import.meta.url));
        
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            this.handleWorkerMessage(event, style);
        };
        
        styleWorkerMap[style] = worker;
        return worker;
    }

    private handleWorkerMessage(event: MessageEvent<WorkerResponse>, style: AutopilotStyle) {
        // Only process messages from the currently active style's worker
        if (this.currentStyle !== style) {
            return;
        }

        if (event.data.type === 'playNote') {
            this.audioEngine.playAutopilotEvent(event.data.note, event.data.time);
        }
    }
    
    private handleTransportStart() {
        if (this.isAutopilotOn && this.activeWorker) {
            this.postMessageToActiveWorker({ type: 'start' });
        }
    }

    private handleTransportStop() {
        // Stop all workers to be safe
        for (const worker of Object.values(styleWorkerMap)) {
            worker?.postMessage({ type: 'stop' });
        }
    }

    private postMessageToActiveWorker(message: WorkerEvent) {
        this.activeWorker?.postMessage(message);
    }
    
    private postMessageToAllWorkers(message: WorkerEvent) {
        for (const worker of Object.values(styleWorkerMap)) {
            worker?.postMessage(message);
        }
    }

    public setTempo(bpm: number) {
        this.postMessageToAllWorkers({ type: 'setTempo', bpm: bpm });
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.postMessageToAllWorkers({ type: 'setHarmony', key, scale });
    }

    public setAutopilotParts(parts: Record<AutopilotPart, boolean>) {
        this.postMessageToActiveWorker({ type: 'setParts', parts: parts });
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;

        this.isAutopilotOn = isOn;
        
        if (this.currentStyle !== style) {
            // Stop the old worker if it exists
            if (this.activeWorker) {
                this.activeWorker.postMessage({ type: 'stop' });
            }
            
            // Switch to the new worker
            this.currentStyle = style;
            this.activeWorker = this.getWorker(style);
            
            // Sync the new worker's state
            this.syncWorkerState();
        }

        if (isOn) {
            if (Tone.Transport.state === 'started') {
                 this.handleTransportStart();
            }
        } else {
            if (this.activeWorker) {
                this.activeWorker.postMessage({ type: 'stop' });
            }
        }
    }

    // Syncs the state of the currently active worker
    private syncWorkerState() {
        if (!this.activeWorker) return;
        // This is a placeholder for sending all current state (tempo, key, etc.)
        // to the newly activated worker.
        // For now, postMessageToAllWorkers handles this implicitly.
    }
}
