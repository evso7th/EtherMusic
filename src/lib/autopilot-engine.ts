
'use client';
import * as Tone from 'tone';
import type { AudioEngine } from './audio-engine';
import type { NoteEvent, WorkerResponse } from './autopilot-worker';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';

const LOOKAHEAD_TIME_S = 0.1; // How far ahead to schedule notes
const SCHEDULE_INTERVAL_MS = 25; // How often to check for notes to schedule

export class AutopilotEngine {
    private audioEngine: AudioEngine;
    private worker: Worker | null = null;
    private schedulerIntervalId: number | null = null;

    private isRunning = false;
    private noteCache: NoteEvent[] = [];
    private nextMeasureStartTime = 0;

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this.setWorker();
    }

    private setWorker() {
        // Path is relative to the 'public' directory
        this.worker = new Worker('/assets/workers/autopilot.worker.js');
        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            if (e.data.type === 'notesGenerated') {
                this.handleNotesFromWorker(e.data.notes);
            }
        };
    }

    public start() {
        if (this.isRunning || !this.worker) return;
        this.isRunning = true;
        this.noteCache = [];
        this.nextMeasureStartTime = Tone.Transport.seconds;
        this.worker.postMessage({ type: 'start' });
        this.fillBuffer(); // Initial fill
        
        if (this.schedulerIntervalId) {
            clearInterval(this.schedulerIntervalId);
        }
        this.schedulerIntervalId = window.setInterval(
            this.scheduler.bind(this),
            SCHEDULE_INTERVAL_MS
        );
    }
    
    public stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.schedulerIntervalId) {
            clearInterval(this.schedulerIntervalId);
            this.schedulerIntervalId = null;
        }
        if (this.worker) {
            this.worker.postMessage({ type: 'stop' });
        }
        this.noteCache = []; // Clear cache on stop
        // We don't stop the audio engine's transport here, just the autopilot part
        this.audioEngine.stopAllAutopilotSounds();
    }
    
    public setAutopilot(isOn: boolean) {
        if (isOn) this.start();
        else this.stop();
    }

    private handleNotesFromWorker(notes: NoteEvent[]) {
        if (!this.isRunning) return;
        
        const bpm = Tone.Transport.bpm.value;
        const measureDuration = (60 / bpm) * 4;

        notes.forEach(note => {
             this.noteCache.push({
                ...note,
                time: this.nextMeasureStartTime + note.time, // Calculate absolute time
            });
        });
        this.nextMeasureStartTime += measureDuration;
    }

    private fillBuffer() {
        if (!this.isRunning || !this.worker) return;
        // Keep about 2 measures ahead
        const bpm = Tone.Transport.bpm.value;
        const measureDuration = (60 / bpm) * 4;
        const bufferTime = Tone.Transport.seconds + (measureDuration * 2);

        if (this.nextMeasureStartTime < bufferTime) {
            this.worker.postMessage({ type: 'generateNotes' });
        }
    }

    private scheduler() {
        if (!this.isRunning) return;

        const scheduleUntil = Tone.Transport.seconds + LOOKAHEAD_TIME_S;
        
        // Find notes that need to be scheduled
        const notesToSchedule = this.noteCache.filter(note => note.time < scheduleUntil);
        
        if (notesToSchedule.length > 0) {
            // Schedule them
            notesToSchedule.forEach(note => {
                this.audioEngine.playAutopilotEvent(note, note.time);
            });

            // Remove them from the cache
            this.noteCache = this.noteCache.filter(note => note.time >= scheduleUntil);
        }
        
        // Keep the buffer full
        this.fillBuffer();
    }
    
    public setTempo(bpm: number) {
        this.worker?.postMessage({ type: 'setTempo', bpm });
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.worker?.postMessage({ type: 'setHarmony', key, scale });
    }
    
    public setStyle(style: AutopilotStyle) {
        this.worker?.postMessage({ type: 'setStyle', style });
    }
}

    