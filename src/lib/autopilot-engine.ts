
'use client';

import * as Tone from 'tone';
import type { MusicKey, MusicScale, AutopilotStyle } from '@/app/page';
import type { WorkerEvent, WorkerResponse, AutopilotPart, NoteEvent } from './autopilot-worker';
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
        bpm: 90,
        key: 'C',
        scale: 'Major Pentatonic',
        parts: { bass: true, accompaniment: true, melody: true, effects: true },
        style: 'Ambient'
    };

    constructor(audioEngine: AudioEngine) {
        this.audioEngine = audioEngine;
        this.initialize();
    }

    private initialize() {
        this.tickLoop = new Tone.Loop(time => {
            if (this.isAutopilotOn && this.activeWorker) {
                 this.postMessageToActiveWorker({ type: 'tick', time });
            }
        }, '16n');

        Tone.Transport.on('start', () => this.tickLoop?.start(0));
        Tone.Transport.on('stop', () => {
            this.postMessageToActiveWorker({ type: 'stop' });
            this.tickLoop?.stop();
        });
    }
    
    private handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
        if (!this.isAutopilotOn) return;
        const { type, note, time } = event.data;
        if (type === 'playNote' && note) {
            this.audioEngine.playAutopilotEvent(note, time);
        }
    }

    private getWorker(style: AutopilotStyle): Worker {
        if (workerCache[style]) {
            return workerCache[style]!;
        }

        let workerFileName: string;
        switch(style) {
            case 'Toccata':     workerFileName = 'toccata.worker.js'; break;
            case 'Promenade':   workerFileName = 'promenade.worker.js'; break;
            case 'House':       workerFileName = 'house.worker.js'; break;
            case 'Wind':        workerFileName = 'wind.worker.js'; break;
            case 'Sequence':    workerFileName = 'sequence.worker.js'; break;
            case 'Chimes':      workerFileName = 'chimes.worker.js'; break;
            case 'Drone':       workerFileName = 'drone.worker.js'; break;
            case 'Space':       workerFileName = 'space.worker.js'; break;
            case 'Ambient':
            default:            workerFileName = 'ambient.worker.js'; break;
        }

        const workerPath = `/assets/workers/${workerFileName}`;
        const worker = new Worker(workerPath, { type: 'module' });
        
        worker.onmessage = this.handleWorkerMessage;
        worker.onerror = (e) => console.error(`Error in worker ${style}:`, e);

        workerCache[style] = worker;
        return worker;
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
            bassOctaves: [2, 3], // BASS OCTAVE CHANGE
            melodyOctaves: [4, 5],
            accompanimentOctaves: [3, 4]
        });
    }

    public setAutopilotParts(parts: Record<AutopilotPart, boolean>) {
        this.lastKnownState.parts = parts;
        this.postMessageToActiveWorker({ type: 'setParts', parts: parts });
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        const styleChanged = this.currentStyle !== style;
        
        if (this.activeWorker && (!isOn || styleChanged)) {
            this.postMessageToActiveWorker({ type: 'stop' });
            // We don't terminate workers anymore, just stop them.
            // This allows us to keep them in cache and reuse them.
        }

        this.isAutopilotOn = isOn;
        this.currentStyle = style;
        this.lastKnownState.style = style;

        if (isOn) {
            this.activeWorker = this.getWorker(style);
            this.syncWorkerState();
            this.postMessageToActiveWorker({ type: 'start' });

            if (Tone.Transport.state !== 'started') {
                 // If transport is stopped, we still need to start it to run the loop
                 // This ensures autopilot works even if drums are off.
                this.audioEngine.start();
            }
        } else {
             if (this.activeWorker) {
                 this.postMessageToActiveWorker({ type: 'stop' });
             }
        }
    }

    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.setTempo(this.lastKnownState.bpm);
        this.setHarmony(this.lastKnownState.key, this.lastKnownState.scale);
        this.setAutopilotParts(this.lastKnownState.parts);
        this.postMessageToActiveWorker({ type: 'setStyle', style: this.lastKnownState.style });
    }

    public dispose() {
        this.tickLoop?.dispose();
        Tone.Transport.off('start');
        Tone.Transport.off('stop');
        Object.values(workerCache).forEach(worker => worker?.terminate());
        this.activeWorker = null;
    }
}
