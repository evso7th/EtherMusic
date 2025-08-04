
'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart, NoteEvent } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

const LOOKAHEAD_TIME = 0.2; // seconds, how far ahead to schedule
const SCHEDULE_INTERVAL = '16n'; // a 16th note, how often to check for scheduling

export class AutopilotEngine {
    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private currentStyle: AutopilotStyle = 'Ambient';
    private isAutopilotOn = false;
    
    private noteCache: NoteEvent[] = [];
    private nextMeasureToGenerate = 0;
    private schedulerEventId: number | null = null;
    private isGenerating = false;
    private isPlaying = false; 

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
            this.noteCache.sort((a, b) => {
                if (a.measure !== b.measure) return a.measure - b.measure;
                return a.subdivision - b.subdivision;
            });
            this.isGenerating = false;
        }
    }
    
    private scheduleNotes = () => {
        const now = Tone.now();
        const scheduleUntil = now + LOOKAHEAD_TIME;

        while(this.noteCache.length > 0) {
            const absoluteNoteTime = this.audioEngine.getAbsoluteTimeForNote(this.noteCache[0]);
            
            if (absoluteNoteTime < scheduleUntil) {
                 const noteToSchedule = this.noteCache.shift();
                 if (noteToSchedule) {
                    this.audioEngine.scheduleAutopilotNote(noteToSchedule, absoluteNoteTime);
                 }
            } else {
                break;
            }
        }
    }

    private requestNextMeasureIfNeeded() {
        if (this.isGenerating || !this.isPlaying || !this.isAutopilotOn) return;

        const currentMeasure = Math.floor(Tone.Transport.position.toString().split(':')[0]);
        const bufferMeasures = 2;
        
        // If the cache is running low (e.g., less than 2 measures ahead), generate more.
        if(this.nextMeasureToGenerate <= currentMeasure + bufferMeasures) {
            this.isGenerating = true;
            this.postMessageToActiveWorker({
                type: 'generateMeasure',
                measure: this.nextMeasureToGenerate,
            });
            this.nextMeasureToGenerate++;
        }
    }
    
    private mainLoop = () => {
        if (!this.isAutopilotOn || !this.isPlaying) return;
        this.requestNextMeasureIfNeeded();
        this.scheduleNotes();
    }

    private setWorker(): void {
        if (this.activeWorker) {
            this.activeWorker.onmessage = null;
            this.activeWorker.terminate();
        }
        const workerPath = `/assets/workers/ambient.worker.js`;
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
        this.isPlaying = isPlaying;
        this.isAutopilotOn = isOn;
        this.setStyle(style);
        
        if (isOn && isPlaying) {
            this.start();
        } else {
            this.stop();
        }
    }

    public start() {
        if (this.schedulerEventId !== null) return;
        this.resetAutopilot();
        this.schedulerEventId = Tone.Transport.scheduleRepeat(this.mainLoop, SCHEDULE_INTERVAL);
    }

    public stop() {
        if (this.schedulerEventId !== null) {
            Tone.Transport.clear(this.schedulerEventId);
            this.schedulerEventId = null;
        }
        this.audioEngine.stopAllAutopilotSounds();
        this.noteCache = [];
        this.nextMeasureToGenerate = 0;
        this.isGenerating = false;
    }

    private resetAutopilot() {
        this.noteCache = [];
        this.nextMeasureToGenerate = 0;
        this.isGenerating = false;
        this.postMessageToActiveWorker({ type: 'reset' });
        
        // If it's currently running, restart to apply changes immediately
        if (this.isAutopilotOn && this.isPlaying) {
            if (this.schedulerEventId !== null) {
                Tone.Transport.clear(this.schedulerEventId);
                this.schedulerEventId = null;
            }
            this.start();
        }
    }

    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.setHarmony(this.lastKnownState.key, this.lastKnownState.scale);
        this.setAutopilotParts(this.lastKnownState.parts);
        this.setStyle(this.currentStyle);
    }

    public dispose() {
        this.stop();
        this.activeWorker?.terminate();
        this.activeWorker = null;
    }
}
