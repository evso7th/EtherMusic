

'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart, NoteEvent } from './autopilot-worker';
import type { AudioEngine } from './audio-engine';

const LOOKAHEAD_TIME = 0.2; // seconds, how far ahead to schedule
const SCHEDULE_INTERVAL = 100; // ms, how often to check for scheduling

export class AutopilotEngine {
    private audioEngine: AudioEngine;
    private activeWorker: Worker | null = null;
    private currentStyle: AutopilotStyle = 'Ambient';
    private isAutopilotOn = false;
    
    private noteCache: NoteEvent[] = [];
    private nextMeasureToGenerate = 0;
    private schedulerId: number | null = null;
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
            this.isGenerating = false;
        }
    }
    
    private scheduleNotes = () => {
        const now = Tone.now();
        const scheduleUntil = now + LOOKAHEAD_TIME;

        while(this.noteCache.length > 0 && this.noteCache[0].time < scheduleUntil) {
            const noteToSchedule = this.noteCache.shift();
            if (noteToSchedule) {
                this.audioEngine.scheduleAutopilotNote(noteToSchedule, noteToSchedule.time);
            }
        }
    }

    private requestNextMeasureIfNeeded() {
        if (this.isGenerating) return;

        const currentMeasure = Tone.Transport.position.toString().split(':')[0];
        const lookaheadMeasure = parseFloat(currentMeasure) + 1;

        if (this.nextMeasureToGenerate <= lookaheadMeasure) {
             this.isGenerating = true;
             this.postMessageToActiveWorker({
                type: 'generateMeasure',
                measure: this.nextMeasureToGenerate,
            });
            this.nextMeasureToGenerate++;
        }
    }
    
    private mainLoop = () => {
        if (!this.isAutopilotOn) return;
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
    
    public setTempo(bpm: number) {
        // The main engine controls tempo, so we don't need to inform the worker
        // as it now works in measures, not absolute time.
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

    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        if (this.isAutopilotOn === isOn && this.currentStyle === style) return;

        this.isAutopilotOn = isOn;
        this.setStyle(style);
        
        if (isOn) {
            this.start();
        } else {
            this.stop();
        }
    }

    private start() {
        if (this.schedulerId !== null) return;
        this.resetAutopilot();
        this.schedulerId = setInterval(this.mainLoop, SCHEDULE_INTERVAL) as any;
        if (Tone.Transport.state !== 'started') {
            this.audioEngine.setPlaying(true);
        }
    }

    private stop() {
        if (this.schedulerId !== null) {
            clearInterval(this.schedulerId);
            this.schedulerId = null;
        }
        this.noteCache = [];
        // Optional: could send a stop message to the worker to halt generation
        if (Tone.Transport.state === 'started' && this.audioEngine.drumMachine.currentBeatPatternName === 'Off'){
             this.audioEngine.setPlaying(false);
        }
    }

    private resetAutopilot() {
        this.noteCache = [];
        this.nextMeasureToGenerate = Math.floor(Tone.Transport.now() / Tone.Time('1m').toSeconds());
        this.isGenerating = false;
        // Tell worker to clear its state if necessary
        this.postMessageToActiveWorker({ type: 'reset' });
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
