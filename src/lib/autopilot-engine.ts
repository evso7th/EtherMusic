
import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

// A map to hold the worker instances
const workerCache: Partial<Record<AutopilotStyle, Worker>> = {};

export class AutopilotEngine {
    public isInitialized = false;

    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private currentStyle: AutopilotStyle | null = null;
    private isAutopilotOn = false;

    // Store the last known state to sync new workers
    private lastKnownState: {
        bpm: number;
        key: MusicKey;
        scale: MusicScale;
        parts: Record<AutopilotPart, boolean>;
    } = {
        bpm: 120,
        key: 'C',
        scale: 'Major Pentatonic',
        parts: { bass: true, accompaniment: true, melody: true, effects: true }
    };

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
        if (workerCache[style]) {
            return workerCache[style]!;
        }

        console.log(`Creating worker for style: ${style}`);
        
        let workerUrl: URL;
        const styleFileName = `${style.toLowerCase().split(' ').join('-')}.worker.ts`;

        try {
            // This structure assumes we will create a worker for each style.
            // The dynamic import URL is key here.
            workerUrl = new URL(`./autopilot-styles/${styleFileName}`, import.meta.url);
        } catch (e) {
            console.warn(`Worker for style "${style}" not found, falling back to ambient.worker.ts`);
            workerUrl = new URL('./autopilot-styles/ambient.worker.ts', import.meta.url);
        }

        const worker = new Worker(workerUrl, { type: 'module' });
        
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            this.handleWorkerMessage(event, style);
        };
        
        workerCache[style] = worker;
        return worker;
    }
    
    private handleWorkerMessage(event: MessageEvent<WorkerResponse>, style: AutopilotStyle) {
        // Only process messages from the currently active style's worker
        if (this.currentStyle !== style || !this.isAutopilotOn) {
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
        this.postMessageToActiveWorker({ type: 'stop' });
    }

    private postMessageToActiveWorker(message: WorkerEvent) {
        this.activeWorker?.postMessage(message);
    }
    
    public setTempo(bpm: number) {
        this.lastKnownState.bpm = bpm;
        // We can send tempo updates to all workers, or just the active one.
        // For now, let's just update the active one for efficiency.
        this.postMessageToActiveWorker({ type: 'setTempo', bpm: bpm });
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.lastKnownState.key = key;
        this.lastKnownState.scale = scale;
        this.postMessageToActiveWorker({ type: 'setHarmony', key, scale });
    }

    public setAutopilotParts(parts: Record<AutopilotPart, boolean>) {
        this.lastKnownState.parts = parts;
        this.postMessageToActiveWorker({ type: 'setParts', parts: parts });
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (!this.isInitialized) return;

        const previousState = this.isAutopilotOn;
        this.isAutopilotOn = isOn;
        
        if (this.currentStyle !== style) {
            // Style has changed, we need to switch workers
            if (this.activeWorker) {
                this.activeWorker.postMessage({ type: 'stop' });
            }
            
            this.currentStyle = style;
            this.activeWorker = this.getWorker(style);
            
            // Sync the new worker with the latest state
            this.syncWorkerState();
        }

        if (isOn) {
            // If it was off and is now on, or if the style changed while it was on
            if (!previousState || this.currentStyle === style) {
                 if (Tone.Transport.state === 'started') {
                     this.handleTransportStart();
                 }
            }
        } else {
            // If it was on and is now off
            if (previousState) {
                this.handleTransportStop();
            }
        }
    }

    private syncWorkerState() {
        if (!this.activeWorker) return;
        console.log(`Syncing new worker for style ${this.currentStyle} with state:`, this.lastKnownState);
        this.postMessageToActiveWorker({ type: 'setTempo', bpm: this.lastKnownState.bpm });
        this.postMessageToActiveWorker({ type: 'setHarmony', key: this.lastKnownState.key, scale: this.lastKnownState.scale });
        this.postMessageToActiveWorker({ type: 'setParts', parts: this.lastKnownState.parts });
    }
}
