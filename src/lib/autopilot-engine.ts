

'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

export class AutopilotEngine {
    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private currentStyle: AutopilotStyle = 'Ambient';
    private isAutopilotOn = false;
    
    private lastKnownState: {
        bpm: number;
        key: MusicKey;
        scale: MusicScale;
        parts: Record<AutopilotPart, boolean>;
    } = {
        bpm: 90,
        key: 'C',
        scale: 'Major Pentatonic',
        parts: { bass: true, accompaniment: true, melody: true, effects: true },
    };

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this.setWorker(this.currentStyle); // Pre-load the default worker
    }

    private handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
        if (!this.isAutopilotOn) return;
        const { type, note } = event.data;
        if (type === 'playNote' && note) {
            // Schedule the note to be played 'now' as decided by the worker's internal clock
            this.audioEngine.playAutopilotEvent(note, Tone.now());
        }
    }

    private setWorker(style: AutopilotStyle): Worker {
        // Since we have a single worker file, we just create one instance
        if (this.activeWorker) {
            this.activeWorker.onmessage = null; // Clean up old listener
            this.activeWorker.terminate(); // Terminate the old worker
        }
        const workerPath = `/assets/workers/ambient.worker.js`;
        try {
            const worker = new Worker(workerPath, { type: 'module' });
            worker.onmessage = this.handleWorkerMessage;
            this.activeWorker = worker;
            this.syncWorkerState(); // Sync state with the new worker instance
            return worker;
        } catch (e) {
            console.error(`Failed to load worker:`, e);
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
        this.postMessageToActiveWorker({ 
            type: 'setHarmony', 
            key, 
            scale,
            bassOctaves: [2, 3], 
            melodyOctaves: [4, 5],
            accompanimentOctaves: [3, 4]
        });
    }

    public setAutopilotParts(parts: Record<AutopilotPart, boolean>) {
        this.lastKnownState.parts = parts;
        this.postMessageToActiveWorker({ type: 'setParts', parts: parts });
    }
    
    public setStyle(style: AutopilotStyle) {
        if (this.currentStyle === style) return;
        this.currentStyle = style;
        this.postMessageToActiveWorker({ type: 'setStyle', style });
    }

    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        this.isAutopilotOn = isOn;
        this.setStyle(style); // Always update the style
        
        if (isOn) {
            if (Tone.Transport.state !== 'started') {
                this.audioEngine.setPlaying(true);
            }
            this.postMessageToActiveWorker({ type: 'start' });
        } else {
            this.postMessageToActiveWorker({ type: 'stop' });
            if (Tone.Transport.state === 'started' && this.audioEngine.drumMachine.currentBeatPatternName === 'Off'){
                 this.audioEngine.setPlaying(false);
            }
        }
    }

    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.setTempo(this.lastKnownState.bpm);
        this.setHarmony(this.lastKnownState.key, this.lastKnownState.scale);
        this.setAutopilotParts(this.lastKnownState.parts);
        this.setStyle(this.currentStyle);
    }

    public dispose() {
        this.activeWorker?.terminate();
        this.activeWorker = null;
    }
}
