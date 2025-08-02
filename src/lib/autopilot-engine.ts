
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

        // This is a specific pattern to let Webpack/Next.js handle worker bundling.
        // We create the new Worker with a special URL constructor syntax.
        try {
            if (style === 'Toccata') {
                 workerUrl = new URL('./autopilot-styles/toccata.worker.ts', import.meta.url);
            } else {
                // Default to ambient for any other style for now
                workerUrl = new URL('./autopilot-styles/ambient.worker.ts', import.meta.url);
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

        const wasAutopilotOn = this.isAutopilotOn;
        const didStyleChange = this.currentStyle !== style;
        this.isAutopilotOn = isOn;
        
        if (didStyleChange) {
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
            // Case 1: Turning autopilot ON from OFF state.
            // Case 2: Autopilot was already ON, and the style changed.
            if (!wasAutopilotOn || (wasAutopilotOn && didStyleChange)) {
                 if (Tone.Transport.state === 'started') {
                     // If transport is already running, we need to manually start the worker.
                     this.handleTransportStart();
                 }
            }
        } else {
            // Case 3: Turning autopilot OFF.
            if (wasAutopilotOn) {
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
