
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
    } = {
        bpm: 90,
        key: 'C',
        scale: 'Major Pentatonic',
        parts: { bass: true, accompaniment: true, melody: true, effects: true },
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
        Tone.Transport.on('pause', () => {
             this.postMessageToActiveWorker({ type: 'stop' });
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
            const worker = workerCache[style]!;
            // Re-attach the message handler as it might have been cleared
            worker.onmessage = this.handleWorkerMessage;
            return worker;
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
        try {
            const worker = new Worker(workerPath, { type: 'module' });
            worker.onmessage = this.handleWorkerMessage;
            workerCache[style] = worker;
            return worker;
        } catch (e) {
            console.error(`Failed to load worker for style ${style}:`, e);
            throw e;
        }
    }
    
    private postMessageToActiveWorker(message: WorkerEvent) {
        try {
            this.activeWorker?.postMessage(message);
        } catch (e) {
            console.error("Failed to post message to worker:", e, "Message:", message);
        }
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
            melodyOctaves: [3, 4, 5],
            accompanimentOctaves: [3, 4]
        });
    }

    public setAutopilotParts(parts: Record<AutopilotPart, boolean>) {
        this.lastKnownState.parts = parts;
        this.postMessageToActiveWorker({ type: 'setParts', parts: parts });
    }
    
    public setAutopilot(isOn: boolean, style: AutopilotStyle) {
        const styleChanged = this.currentStyle !== style;

        // If turning off, or changing style, stop the current worker
        if (this.activeWorker && (!isOn || styleChanged)) {
            this.postMessageToActiveWorker({ type: 'stop' });
            this.activeWorker.onmessage = null; // Detach listener to prevent memory leaks
            this.activeWorker = null;
        }

        this.isAutopilotOn = isOn;
        this.currentStyle = style;

        if (isOn) {
            try {
                this.activeWorker = this.getWorker(style);
                this.syncWorkerState();
                
                // If transport is already running, tell the new worker to start
                if (Tone.Transport.state === 'started') {
                    this.postMessageToActiveWorker({ type: 'start' });
                } else {
                    // If transport is stopped, let's start it.
                    // This handles the case where autopilot is turned on before play is pressed.
                    this.audioEngine.setPlaying(true);
                }

            } catch (e) {
                console.error(`Could not set up autopilot for style ${style}`, e);
                this.isAutopilotOn = false;
                this.activeWorker = null;
            }
        } else if (Tone.Transport.state === 'started' && !this.audioEngine.drumMachine.isPlaying()){
            // If we turn off autopilot and the drum machine is also off, stop the transport
             this.audioEngine.setPlaying(false);
        }
    }

    private syncWorkerState() {
        if (!this.activeWorker) return;
        this.setTempo(this.lastKnownState.bpm);
        this.setHarmony(this.lastKnownState.key, this.lastKnownState.scale);
        this.setAutopilotParts(this.lastKnownState.parts);
    }

    public dispose() {
        this.tickLoop?.dispose();
        Tone.Transport.off('start');
        Tone.Transport.off('stop');
        Tone.Transport.off('pause');
        Object.values(workerCache).forEach(worker => worker?.terminate());
        this.activeWorker = null;
    }
}
