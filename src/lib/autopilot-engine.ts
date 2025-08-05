
'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale } from '@/app/page';
import type { WorkerEvent, WorkerResponse, NoteEvent } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

export class AutopilotEngine {
    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private isRunning = false;
    private loop: Tone.Loop | null = null;
    private lastKnownState: {
        key: MusicKey;
        scale: MusicScale;
        bpm: number;
    } = {
        key: 'C',
        scale: 'Major Pentatonic',
        bpm: 90,
    };

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this.setWorker();
    }

    private handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'notesGenerated' && this.isRunning) {
            Tone.Transport.scheduleOnce((time) => {
                event.data.notes.forEach(note => {
                    this.audioEngine.playAutopilotEvent(note, time + note.timingOffset);
                });
            }, `+${event.data.scheduleTime}`);
        }
    }

    private setWorker(): void {
        if (this.activeWorker) {
            this.activeWorker.terminate();
        }
        const workerPath = `/assets/workers/autopilot.worker.js`;
        try {
            this.activeWorker = new Worker(workerPath, { type: 'module' });
            this.activeWorker.onmessage = this.handleWorkerMessage;
            this.syncWorkerState();
        } catch (e) {
            console.error(`Failed to load worker:`, e);
        }
    }
    
    private postMessageToActiveWorker(message: WorkerEvent) {
        this.activeWorker?.postMessage(message);
    }
    
    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.lastKnownState.key = key;
        this.lastKnownState.scale = scale;
        this.postMessageToActiveWorker({ 
            type: 'setHarmony', 
            key, 
            scale,
        });
    }

    public setTempo(bpm: number) {
        this.lastKnownState.bpm = bpm;
        this.postMessageToActiveWorker({ type: 'setTempo', bpm });
    }

    public start() {
        if (this.isRunning || !this.audioEngine.isInitialized) return;
        console.log("AutopilotEngine: Starting...");

        this.isRunning = true;
        this.syncWorkerState();
        
        // Use Tone.Loop for sample-accurate scheduling
        this.loop = new Tone.Loop(time => {
            this.postMessageToActiveWorker({ type: 'generateNotes' });
        }, '1m').start(0); // Generate notes every measure
    }

    public stop() {
        if (!this.isRunning) return;
        console.log("AutopilotEngine: Stopping...");

        this.isRunning = false;
        if (this.loop) {
            this.loop.stop(0);
            this.loop.dispose();
            this.loop = null;
        }
        
        // This is important to clear any scheduled but not yet played notes.
        this.audioEngine.stopAllAutopilotSounds();
    }
    
    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.postMessageToActiveWorker({ 
            type: 'setHarmony', 
            key: this.lastKnownState.key, 
            scale: this.lastKnownState.scale,
        });
        this.postMessageToActiveWorker({ type: 'setTempo', bpm: this.lastKnownState.bpm });
    }

    public dispose() {
        this.stop();
        this.activeWorker?.terminate();
        this.activeWorker = null;
    }
}

    