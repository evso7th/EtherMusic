
'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

const workerCache: Partial<Record<AutopilotStyle, Worker>> = {};

export class AutopilotEngine {
    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private currentStyle: AutopilotStyle | null = null;
    private isAutopilotOn = false;
    private tickLoop: Tone.Loop | null = null;

    private lastKnownState: {
        bpm: number;
        key: MusicKey;
        scale: MusicScale;
        parts: Record<AutopilotPart, boolean>;
        style: AutopilotStyle;
    } = {
        bpm: 120,
        key: 'C',
        scale: 'Major Pentatonic',
        parts: { bass: true, accompaniment: true, melody: true, effects: true },
        style: 'Ambient'
    };

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this.initialize();
    }

    public initialize() {
        this.tickLoop = new Tone.Loop(time => {
            this.postMessageToActiveWorker({ type: 'tick', time });
        }, '16n').start(0);

        this.handleTransportStop(); // Ensure clean state initially
        Tone.Transport.on('stop', this.handleTransportStop);
    }
    
    private handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
        if (!this.isAutopilotOn) return;

        const { type, note, time } = event.data;
        if (type === 'playNote') {
            this.audioEngine.playAutopilotEvent(note, time);
        }
    }

    private handleTransportStop = () => {
         this.postMessageToActiveWorker({ type: 'stop' });
    };

    private getWorker(style: AutopilotStyle): Worker {
        if (workerCache[style]) {
            return workerCache[style]!;
        }

        let workerFileName: string;
        switch(style) {
            case 'Toccata': workerFileName = 'toccata.worker.js'; break;
            case 'Promenade': workerFileName = 'promenade.worker.js'; break;
            case 'Ambient':
            case 'House':
            case 'Wind':
            case 'Sequence':
            case 'Chimes':
            case 'Drone':
            case 'Space':
            default: workerFileName = 'ambient.worker.js'; break;
        }

        try {
            const workerPath = `/assets/workers/${workerFileName}`;
            const worker = new Worker(workerPath, { type: 'module' });
            
            worker.onmessage = this.handleWorkerMessage;
            worker.onerror = (e) => console.error(`Error in worker ${style}:`, e);

            workerCache[style] = worker;
            return worker;
        } catch (e) {
            console.error(`Failed to construct Worker for style ${style}:`, e);
            if (style !== 'Ambient') return this.getWorker('Ambient'); // Fallback
            throw e;
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
        const styleChanged = this.currentStyle !== style;

        if (this.activeWorker && (styleChanged || !isOn)) {
            this.postMessageToActiveWorker({ type: 'stop' });
            this.activeWorker = null;
            this.currentStyle = null;
        }

        this.isAutopilotOn = isOn;
        this.lastKnownState.style = style;
        
        if (isOn) {
            this.activeWorker = this.getWorker(style);
            this.currentStyle = style;
            this.syncWorkerState();
            
            if (Tone.Transport.state !== 'started') {
                 // If transport isn't running, start it. The loop will handle the ticks.
                Tone.Transport.start();
            } else {
                // If it is running, send a start message to sync up the worker immediately.
                this.postMessageToActiveWorker({ type: 'start' });
            }
        }
    }

    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.postMessageToActiveWorker({ type: 'setTempo', bpm: this.lastKnownState.bpm });
        this.postMessageToActiveWorker({ type: 'setHarmony', key: this.lastKnownState.key, scale: this.lastKnownState.scale });
        this.postMessageToActiveWorker({ type: 'setParts', parts: this.lastKnownState.parts });
        this.postMessageToActiveWorker({ type: 'setStyle', style: this.lastKnownState.style });
    }

    public dispose() {
        this.tickLoop?.dispose();
        Tone.Transport.off('stop', this.handleTransportStop);
        Object.values(workerCache).forEach(worker => worker?.terminate());
        this.activeWorker = null;
    }
}
