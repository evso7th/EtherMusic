
'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

// A map to hold the worker instances for caching and management
const workerCache: Partial<Record<AutopilotStyle, Worker>> = {};


export class AutopilotEngine {
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
        // The initialize method will now be called from page.tsx to ensure it's client-side only
    }

    public initialize() {
        // This handler ensures that if the transport is started (e.g. by user pressing play)
        // and the autopilot is on, the worker will start generating music.
        Tone.Transport.on('start', this.handleTransportStart);

        // This handler stops the worker when the transport stops.
        Tone.Transport.on('stop', this.handleTransportStop);
    }
    
    // Using arrow functions to preserve `this` context when used as event handlers
    private handleTransportStart = () => {
         if (this.isAutopilotOn) {
            this.postMessageToActiveWorker({ type: 'start' });
        }
    };

    private handleTransportStop = () => {
         this.postMessageToActiveWorker({ type: 'stop' });
    };

    private getWorker(style: AutopilotStyle): Worker {
        if (workerCache[style]) {
            return workerCache[style]!;
        }

        // Files are in the /public directory and served directly.
        // We can reference them with a simple absolute path.
        let workerPath: string;
        switch(style) {
            case 'Toccata':
                workerPath = '/assets/workers/toccata.worker.js';
                break;
            case 'Ambient':
            case 'House':
            case 'Wind':
            case 'Sequence':
            case 'Chimes':
            case 'Drone':
            case 'Promenade':
            case 'Space':
            default:
                 // Fallback for styles that don't have a dedicated worker yet
                workerPath = '/assets/workers/ambient.worker.js';
                break;
        }

        try {
            // Create the worker using the public path.
            const worker = new Worker(workerPath, { type: 'module' });
            
            // CRITICAL FIX: Set up the message handler when the worker is created.
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                this.handleWorkerMessage(event, style);
            };

            workerCache[style] = worker;
            return worker;
        } catch (e) {
            console.error(`Failed to construct Worker for style ${style} from path ${workerPath}:`, e);
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
        const wasOn = this.isAutopilotOn;
        const didStyleChange = this.currentStyle !== style;

        // --- Stop old worker if it was on and style changes or autopilot is turned off ---
        if (wasOn && (didStyleChange || !isOn)) {
            this.postMessageToActiveWorker({ type: 'stop' });
            this.activeWorker = null;
            this.currentStyle = null;
        }

        this.isAutopilotOn = isOn;

        // --- Start new worker if it should be on ---
        if (isOn) {
            if (this.activeWorker === null || didStyleChange) {
                this.currentStyle = style;
                this.activeWorker = this.getWorker(style);
                this.syncWorkerState();
            }
            
            // If the transport is already playing, start the worker immediately.
            // Otherwise, it will be started by the 'start' event handler.
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

    public dispose() {
        Tone.Transport.off('start', this.handleTransportStart);
        Tone.Transport.off('stop', this.handleTransportStop);
        Object.values(workerCache).forEach(worker => worker?.terminate());
        this.activeWorker = null;
    }
}
