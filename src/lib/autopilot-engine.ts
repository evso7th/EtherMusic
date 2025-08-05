
'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart, NoteEvent } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

const LOOKAHEAD_TIME_S = 0.2; // How far ahead to schedule notes
const SCHEDULE_INTERVAL_MS = 100; // How often the scheduler runs

export class AutopilotEngine {
    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private currentStyle: AutopilotStyle = 'Ambient';
    private isAutopilotOn = false;
    private isPlaying = false;
    
    private noteCache: NoteEvent[] = [];
    private nextMeasureToGenerate = 0;
    private schedulerIntervalId: ReturnType<typeof setInterval> | null = null;
    private isGenerating = false;

    private lastKnownState: {
        key: MusicKey;
        scale: MusicScale;
        parts: Record<AutopilotPart, boolean>;
    } = {
        key: 'C',
        scale: 'Major Pentatonic',
        parts: { bass: true, accompaniment: true, melody: true, effects: true },
    };

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this.setWorker();
    }

    private handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'measureGenerated') {
            this.noteCache.push(...event.data.notes);
            this.noteCache.sort((a, b) => a.measure - b.measure || a.subdivision - b.subdivision);
            this.isGenerating = false;
        }
    }
    
    private scheduler = () => {
        if (!this.isAutopilotOn || !this.isPlaying || !this.audioEngine.isInitialized) return;

        // 1. Fill the note cache if needed
        const currentMeasure = Math.floor(Tone.Transport.position.toString().split(':')[0]);
        if (!this.isGenerating && this.nextMeasureToGenerate <= currentMeasure + 1) {
            this.isGenerating = true;
            this.postMessageToActiveWorker({
                type: 'generateMeasure',
                measure: this.nextMeasureToGenerate,
            });
            this.nextMeasureToGenerate++;
        }
        
        // 2. Schedule notes from the cache
        const scheduleUntil = Tone.Transport.seconds + LOOKAHEAD_TIME_S;
        
        const notesToKeep = [];
        for (const note of this.noteCache) {
            const timeString = `${note.measure}:${Math.floor(note.subdivision / 4)}:${note.subdivision % 4}`;
            const noteTimeSeconds = new Tone.Time(timeString).toSeconds();

            if (noteTimeSeconds < scheduleUntil && noteTimeSeconds >= Tone.Transport.seconds) {
                this.audioEngine.playAutopilotEvent(note, noteTimeSeconds);
            }

            if (noteTimeSeconds >= Tone.Transport.seconds) {
                notesToKeep.push(note);
            }
        }
        this.noteCache = notesToKeep;
    }
    
    private setWorker(): void {
        if (this.activeWorker) {
            this.activeWorker.onmessage = null;
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
        this.resetAutopilot();
    }

    public setAutopilotParts(parts: Record<AutopilotPart, boolean>) {
        this.lastKnownState.parts = parts;
        this.postMessageToActiveWorker({ type: 'setParts', parts: parts });
        this.resetAutopilot();
    }
    
    public setStyle(style: AutopilotStyle) {
        if (this.currentStyle === style) return;
        this.currentStyle = style;
        this.postMessageToActiveWorker({ type: 'setStyle', style });
        this.resetAutopilot();
    }

    public setAutopilot(isOn: boolean, style: AutopilotStyle, isPlaying: boolean) {
        const wasOn = this.isAutopilotOn;
        this.isAutopilotOn = isOn;
        this.isPlaying = isPlaying;
        
        if (this.currentStyle !== style) {
            this.setStyle(style);
        }

        const shouldBeRunning = isOn && isPlaying;
        const isRunning = this.schedulerIntervalId !== null;

        if (shouldBeRunning && !isRunning) {
            this.start();
        } else if (!shouldBeRunning && isRunning) {
            this.stop();
        }
    }

    public start() {
        if (this.schedulerIntervalId !== null || !this.isAutopilotOn || !this.isPlaying) return;
        this.resetAutopilot(true); // Soft reset before starting
        this.schedulerIntervalId = setInterval(this.scheduler, SCHEDULE_INTERVAL_MS);
        this.scheduler();
    }

    public stop() {
        if (this.schedulerIntervalId !== null) {
            clearInterval(this.schedulerIntervalId);
            this.schedulerIntervalId = null;
        }
        this.audioEngine.stopAllAutopilotSounds();
        this.noteCache = [];
        this.nextMeasureToGenerate = 0;
        this.isGenerating = false;
        this.postMessageToActiveWorker({ type: 'reset' });
    }

    private resetAutopilot(isStarting: boolean = false) {
        if (!isStarting) {
           this.audioEngine.stopAllAutopilotSounds();
        }
        this.noteCache = [];
        this.nextMeasureToGenerate = Math.floor(Tone.Transport.position.toString().split(':')[0]);
        this.isGenerating = false;
        this.postMessageToActiveWorker({ type: 'reset' });
    }

    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.postMessageToActiveWorker({ 
            type: 'setHarmony', 
            key: this.lastKnownState.key, 
            scale: this.lastKnownState.scale,
        });
        this.postMessageToActiveWorker({ type: 'setParts', parts: this.lastKnownState.parts });
        this.postMessageToActiveWorker({ type: 'setStyle', style: this.currentStyle });
    }

    public dispose() {
        this.stop();
        this.activeWorker?.terminate();
        this.activeWorker = null;
    }
}
