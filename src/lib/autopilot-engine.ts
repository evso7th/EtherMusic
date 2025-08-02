
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

        try {
            switch(style) {
                case 'Toccata':
                    workerUrl = new URL('./autopilot-styles/toccata.worker.ts', import.meta.url);
                    break;
                case 'Ambient':
                default:
                    workerUrl = new URL('./autopilot-styles/ambient.worker.ts', import.meta.url);
                    break;
            }
        } catch (e) {
             console.error(`Could not create worker URL for style ${style}, falling back to ambient.`, e);
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

        const didStyleChange = this.currentStyle !== style;
        this.isAutopilotOn = isOn;

        if (didStyleChange) {
            // Style has changed, we need to switch workers
            if (this.activeWorker) {
                this.postMessageToActiveWorker({ type: 'stop' });
            }
            
            this.currentStyle = style;
            this.activeWorker = this.getWorker(style);
            
            // Sync the new worker with the latest state
            this.syncWorkerState();
        }

        if (isOn) {
            // If music is playing, start the worker immediately.
            // This handles both initial startup and style switching.
            if (Tone.Transport.state === 'started') {
                this.handleTransportStart();
            }
        } else {
            // If autopilot is turned off, stop the worker.
            this.handleTransportStop();
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
