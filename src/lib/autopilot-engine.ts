
import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

// A map to hold the worker instances for caching
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
        
        // This handler ensures that if the transport is started (e.g. by user pressing play)
        // and the autopilot is on, the worker will start generating music.
        Tone.Transport.on('start', () => {
             if (this.isAutopilotOn) {
                this.postMessageToActiveWorker({ type: 'start' });
            }
        });

        // This handler stops the worker when the transport stops.
        Tone.Transport.on('stop', () => {
             this.postMessageToActiveWorker({ type: 'stop' });
        });
        
        this.isInitialized = true;
    }

    private getWorker(style: AutopilotStyle): Worker {
        if (workerCache[style]) {
            return workerCache[style]!;
        }

        let workerPath: string;
        // This mapping determines which worker file to load for each style.
        // As more styles are created, they should be added here.
        switch(style) {
            case 'Toccata':
                workerPath = './autopilot-styles/toccata.worker.ts';
                break;
            case 'Ambient': // Default case
            case 'House':
            case 'Wind':
            case 'Sequence':
            case 'Chimes':
            case 'Drone':
            case 'Promenade':
            case 'Space':
            default:
                 workerPath = './autopilot-styles/ambient.worker.ts';
                break;
        }

        try {
            // This special syntax is a hint for bundlers like Webpack/Vite/Next.js
            // to correctly handle the worker file and provide a web-accessible URL.
            const worker = new Worker(new URL(workerPath, import.meta.url), { type: 'module' });
            
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                this.handleWorkerMessage(event, style);
            };
            
            workerCache[style] = worker;
            return worker;
        } catch (e) {
            console.error(`Failed to construct Worker for style ${style}:`, e);
            // Fallback to the default ambient worker if the specified one fails
            if (style !== 'Ambient') {
                return this.getWorker('Ambient');
            }
            throw e;
        }
    }
    
    private handleWorkerMessage(event: MessageEvent<WorkerResponse>, style: AutopilotStyle) {
        // Ignore messages from inactive workers
        if (this.currentStyle !== style || !this.isAutopilotOn) {
            return;
        }

        if (event.data.type === 'playNote') {
            this.audioEngine.playAutopilotEvent(event.data.note, event.data.time);
        }
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

        const wasOn = this.isAutopilotOn;
        const didStyleChange = this.currentStyle !== style;
        
        this.isAutopilotOn = isOn;
        this.currentStyle = style;

        if (!wasOn && isOn) { // --- Turning ON ---
            this.activeWorker = this.getWorker(style);
            this.syncWorkerState();
            // The transport start event will trigger the worker's 'start' message
        } else if (wasOn && !isOn) { // --- Turning OFF ---
            this.postMessageToActiveWorker({ type: 'stop' });
            this.activeWorker = null;
        } else if (wasOn && isOn && didStyleChange) { // --- Switching Style ---
            // Stop the old worker
            this.postMessageToActiveWorker({ type: 'stop' });
            
            // Get the new worker and sync its state
            this.activeWorker = this.getWorker(style);
            this.syncWorkerState();
            
            // If the transport is already playing, start the new worker immediately.
            if (Tone.Transport.state === 'started') {
                this.postMessageToActiveWorker({ type: 'start' });
            }
        }
    }

    // Syncs the new worker with the last known state of the UI/app
    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.postMessageToActiveWorker({ type: 'setTempo', bpm: this.lastKnownState.bpm });
        this.postMessageToActiveWorker({ type: 'setHarmony', key: this.lastKnownState.key, scale: this.lastKnownState.scale });
        this.postMessageToActiveWorker({ type: 'setParts', parts: this.lastKnownState.parts });
    }
}
