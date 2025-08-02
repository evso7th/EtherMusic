
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
        
        let workerPath: string;

        switch(style) {
            case 'Toccata':
                workerPath = './autopilot-styles/toccata.worker.ts';
                break;
            case 'Ambient':
            default:
                 workerPath = './autopilot-styles/ambient.worker.ts';
                break;
        }

        try {
            // This special syntax is a hint for bundlers like Webpack/Vite/Next.js
            // to correctly handle the worker file.
            const worker = new Worker(new URL(workerPath, import.meta.url), { type: 'module' });
            
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                this.handleWorkerMessage(event, style);
            };
            
            workerCache[style] = worker;
            return worker;
        } catch (e) {
            console.error(`Failed to construct Worker for style ${style}`, e);
            // Fallback to ambient if something goes wrong, and ensure it's loaded.
            if (style !== 'Ambient') {
                return this.getWorker('Ambient');
            }
            throw e; // re-throw if even ambient fails
        }
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

        // --- Logic for switching workers ---
        if (didStyleChange) {
            if (this.activeWorker) {
                this.postMessageToActiveWorker({ type: 'stop' });
            }
            this.currentStyle = style;
            this.activeWorker = this.getWorker(style);
            this.syncWorkerState();
        }

        // --- Logic for starting or stopping the active worker ---
        if (isOn) {
            // If the transport is already running, we need to start the new worker.
            // This handles the case of switching styles while music is playing.
            if (Tone.Transport.state === 'started') {
                 this.postMessageToActiveWorker({ type: 'start' });
            }
        } else {
            // If autopilot is turned off, stop the worker.
            this.postMessageToActiveWorker({ type: 'stop' });
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
