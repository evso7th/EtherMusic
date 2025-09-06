// src/lib/audio-engine.ts

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale, Volumes, AutopilotPart, AutopilotSettings } from '@/types';
import { OrbManager } from './orb-manager';

type PartName = 'melody' | 'manualBass' | 'latch' | 'autopilot' | 'accompaniment' | 'autopilotBass' | 'effects' | 'drums';

function dbToGain(db: number) {
    return Math.pow(10, db / 20);
}

export class AudioEngine {
    public isInitialized = false;
    private context!: AudioContext;
    public orbManager: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    public masterOut!: GainNode;
    private nodes = new Map<PartName, { worklet: AudioWorkletNode, gain: GainNode }>();
    private volumes: Volumes;
    private isBassLatchOn: boolean = false;
    private autopilotWorker: Worker | null = null;
    private tickLoop: Tone.Loop | null = null;

    private activeAutopilotParts: AutopilotPart[] = [];
    private autopilotInstruments: { [key in AutopilotPart]?: Instrument } = {};

    constructor(orbManager: OrbManager) {
        this.orbManager = orbManager;
        this.volumes = { 
            melody: -9, 
            manualBass: -9, 
            latch: -18, 
            drums: -12,
            autopilot: -15,
            accompaniment: -18,
            autopilotBass: -12,
            effects: -18,
        };
    }
    
    public getVolumes(): Volumes {
        return {...this.volumes};
    }

    public async initialize(worker: Worker) {
        if (this.isInitialized) return;
        
        console.log('AudioContext started. Loading worklets and samples...');
        
        this.context = Tone.getContext().rawContext as AudioContext;
        this.autopilotWorker = worker;
        
        this.masterOut = this.context.createGain();
        this.masterOut.connect(this.context.destination);
        
        const mediaStreamDest = this.context.createMediaStreamDestination();
        this.masterOut.connect(mediaStreamDest);
        this.mediaRecorder = new MediaRecorder(mediaStreamDest.stream, { mimeType: 'audio/webm' });
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };
        
        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style.display = 'none';
            a.href = url;
            const date = new Date();
            const dateString = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            a.download = `EtherMusic-Session-${dateString}.webm`;
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        };

        try {
            await this.context.audioWorklet.addModule('/worklets/theremin-processor.js');
            await this.context.audioWorklet.addModule('/worklets/drum-processor.js');
            
            this.createWorkletNode('melody', 'theremin-processor');
            this.createWorkletNode('manualBass', 'theremin-processor');
            this.createWorkletNode('latch', 'theremin-processor');
            this.createWorkletNode('autopilot', 'theremin-processor');
            this.createWorkletNode('accompaniment', 'theremin-processor');
            this.createWorkletNode('autopilotBass', 'theremin-processor');
            this.createWorkletNode('effects', 'theremin-processor');
            this.createWorkletNode('drums', 'drum-processor');

            this.setVolumes(this.volumes);

        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        if (this.autopilotWorker) {
            this.autopilotWorker.onmessage = this.handleWorkerMessage.bind(this);
        }

        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        
        this.tickLoop = new Tone.Loop(time => {
            this.autopilotWorker?.postMessage({ type: 'tick', time });
        }, '16n').start(0);

        this.isInitialized = true;
        console.log('AudioEngine initialized with native Web Audio API nodes.');
    }
    
    private createWorkletNode(part: PartName, processorName: string) {
        if (this.nodes.has(part) || !this.context) return;

        const gainNode = this.context.createGain();
        gainNode.connect(this.masterOut);

        const workletNode = new AudioWorkletNode(this.context, processorName, {
            processorOptions: {
                sampleRate: this.context.sampleRate,
                polyphony: (part === 'melody' || part === 'manualBass' || part === 'latch') ? 4 : 8
            },
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });
        workletNode.connect(gainNode);

        this.nodes.set(part, { worklet: workletNode, gain: gainNode });
        console.log(`Created worklet node for: ${part}`);
    }

    private handleWorkerMessage(event: MessageEvent) {
        const { type, payload } = event.data;
        if (type === 'notes') {
            const { part, notes, time } = payload;
            const node = this.nodes.get(part as PartName)?.worklet;
            if (node) {
                node.port.postMessage({ type: 'playNotes', notes, time });
            }
        }
    }
    
    public setAutopilotState(isPlaying: boolean) {
        this.autopilotWorker?.postMessage({ type: 'transportState', isPlaying });
    }

    public updateAutopilot(settings: AutopilotSettings) {
        this.activeAutopilotParts = settings.parts;
        this.autopilotInstruments = settings.instruments;
        this.autopilotWorker?.postMessage({ type: 'updateSettings', settings });
    }

    public setAutopilot(isOn: boolean) {
        this.autopilotWorker?.postMessage({ type: isOn ? 'start' : 'stop' });
    }

    public saveAutopilotPreset(style: string) {
        this.autopilotWorker?.postMessage({ type: 'savePreset', payload: { style } });
    }
    
    public loadAutopilotPreset(style: string) {
        return new Promise<any>((resolve) => {
            if (!this.autopilotWorker) return resolve(null);
            
            const handlePreset = (event: MessageEvent) => {
                if (event.data.type === 'presetLoaded') {
                    this.autopilotWorker?.removeEventListener('message', handlePreset);
                    resolve(event.data.payload);
                }
            };
            this.autopilotWorker.addEventListener('message', handlePreset);
            this.autopilotWorker.postMessage({ type: 'loadPreset', payload: { style } });
        });
    }

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, padInfo: { x: number, y: number, width: number, height: number}) {
        const partName = type === 'bass' && this.isBassLatchOn ? 'latch' : (type === 'bass' ? 'manualBass' : type);
        const node = this.nodes.get(partName)?.worklet;

        if (!node) return;

        node.port.postMessage({
            type: 'noteOn',
            note: {
                id: pointerId,
                frequency: freq,
                volume: vol
            }
        });
        
        const orbType = this.isBassLatchOn && type === 'bass' ? 'latch' : type;
        this.orbManager?.addOrb(pointerId, orbType, padInfo.x, padInfo.y);
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, padInfo: { x: number, y: number, width: number, height: number}) {
        const partName = type === 'bass' && this.isBassLatchOn ? 'latch' : 'manualBass';
        if (type === 'melody') {
            const node = this.nodes.get('melody')?.worklet;
            if(node) {
                node.port.postMessage({ type: 'noteUpdate', note: { id: pointerId, frequency: freq, volume: vol } });
                this.orbManager?.updateOrb(pointerId, padInfo.x, padInfo.y);
            }
        } else if (type === 'bass' && !this.isBassLatchOn) {
            const node = this.nodes.get('manualBass')?.worklet;
             if(node) {
                node.port.postMessage({ type: 'noteUpdate', note: { id: pointerId, frequency: freq, volume: vol } });
                this.orbManager?.updateOrb(pointerId, padInfo.x, padInfo.y);
            }
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        const partName = type === 'bass' && this.isBassLatchOn ? 'latch' : 'manualBass';
        const node = type === 'melody' ? this.nodes.get('melody')?.worklet : this.nodes.get(partName)?.worklet;

        if (!node) return;
        
        if (type === 'bass' && this.isBassLatchOn) {
            // Latch mode toggles notes, it does not use noteOff
        } else {
             node.port.postMessage({ type: 'noteOff', id: pointerId });
        }
        
        if (!(type === 'bass' && this.isBassLatchOn)) {
            this.orbManager?.removeOrb(pointerId);
        }
    }
    
    public setBassLatch(isOn: boolean) {
        this.isBassLatchOn = isOn;
        if (!isOn) {
            this.nodes.get('latch')?.worklet.port.postMessage({ type: 'allNotesOff' });
            this.orbManager.removeAllOrbs('latch');
        }
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        this.autopilotWorker?.postMessage({ type: 'setHarmony', payload: { key, scale } });
    }

    public setBeatPattern(patternName: string) {
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setPattern', pattern: patternName});
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized) return;
        this.volumes = newVolumes;
        const rampTime = this.context.currentTime + 0.05;

        Object.entries(newVolumes).forEach(([part, db]) => {
            const node = this.nodes.get(part as PartName);
            if (node) {
                node.gain.gain.linearRampToValueAtTime(dbToGain(db), rampTime);
            }
        });
        
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setVolume', volume: newVolumes.drums});
    }
    
    public stopAllSounds() {
        if (!this.isInitialized) return;
        this.nodes.forEach(node => {
            node.worklet.port.postMessage({ type: 'allNotesOff' });
        });
        this.orbManager?.removeAllOrbs();
        this.autopilotWorker?.postMessage({ type: 'stop' });
    }
    
    public startRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'recording') return;
        
        this.recordedChunks = [];
        this.mediaRecorder.start();
        console.log("Recording started.");
    }
    
    public stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }
}
