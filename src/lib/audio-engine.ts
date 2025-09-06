
// src/lib/audio-engine.ts

import * as Tone from 'tone';
import type { Instrument, Volumes } from '@/types';
import { OrbManager } from './orb-manager';

type PartName = 'melody' | 'manualBass' | 'latch' | 'drums';

function dbToGain(db: number) {
    if (db <= -48) return 0;
    return Math.pow(10, db / 20);
}

export class AudioEngine {
    public isInitialized = false;
    private context: AudioContext;
    public orbManager: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    public masterOut: Tone.Gain | null = null;
    private nodes = new Map<PartName, { worklet: AudioWorkletNode, gain: Tone.Gain }>();
    private volumes: Volumes = { 
        melody: -6, 
        manualBass: -6, 
        latch: -15, 
        drums: -9
    };
    private isBassLatchOn: boolean = false;
    
    private activePointers = new Map<number, { type: 'melody' | 'bass', part: PartName }>();

    constructor(toneContext: Tone.Context, orbManager: OrbManager) {
        this.context = toneContext.rawContext;
        this.orbManager = orbManager;
    }
    
    public getVolumes(): Volumes {
        return {...this.volumes};
    }

    public async initialize() {
        if (this.isInitialized) {
            return;
        }
        if (this.context.state !== 'running') {
            throw new Error("AudioContext is not running. Cannot initialize AudioEngine.");
        }
        
        console.log('Initializing AudioEngine...');
        
        this.masterOut = new Tone.Gain(1).toDestination();
        
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
            this.recordedChunks = [];
        };

        try {
             await this.context.audioWorklet.addModule('/worklets/theremin-processor.js');
             await this.context.audioWorklet.addModule('/worklets/drum-processor.js');
             console.log('AudioWorklet modules loaded.');
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        this.createWorkletNode('melody', 'theremin-processor');
        this.createWorkletNode('manualBass', 'theremin-processor');
        this.createWorkletNode('latch', 'theremin-processor');
        this.createWorkletNode('drums', 'drum-processor');

        this.setVolumes(this.volumes);
        
        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        
        this.isInitialized = true;
        console.log('AudioEngine initialized with native Web Audio API nodes.');
    }
    
    private createWorkletNode(part: PartName, processorName: string) {
        if (this.nodes.has(part) || !this.context || !this.masterOut) return;
        
        const gainNode = new Tone.Gain(0).connect(this.masterOut);

        const workletNode = new AudioWorkletNode(this.context, processorName, {
            processorOptions: {
                sampleRate: this.context.sampleRate,
                polyphony: (part === 'melody' || part === 'manualBass' || part === 'latch') ? 4 : 8
            },
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1]
        });
        workletNode.connect(gainNode.get());

        this.nodes.set(part, { worklet: workletNode, gain: gainNode });
        console.log(`Created worklet node for: ${part}`);
    }
    
    public play() {
        if (!this.isInitialized) return;
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'start'});
    }

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, padInfo: { x: number, y: number, width: number, height: number}) {
        if (!this.isInitialized) return;
        
        const partName = type === 'bass' && this.isBassLatchOn ? 'latch' : (type === 'bass' ? 'manualBass' : type);
        const node = this.nodes.get(partName)?.worklet;

        if (!node) return;
        
        this.activePointers.set(pointerId, { type, part: partName });

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
        if (!this.isInitialized) return;
        
        const activePointer = this.activePointers.get(pointerId);
        if (!activePointer) return;

        const node = this.nodes.get(activePointer.part)?.worklet;
        if(node) {
            node.port.postMessage({ type: 'noteUpdate', note: { id: pointerId, frequency: freq, volume: vol } });
            this.orbManager?.updateOrb(pointerId, padInfo.x, padInfo.y);
        }
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        if (!this.isInitialized) return;
        
        const activePointer = this.activePointers.get(pointerId);
        if (!activePointer) return;

        const node = this.nodes.get(activePointer.part)?.worklet;

        if (node) {
             node.port.postMessage({ type: 'noteOff', id: pointerId });
        }
        
        // Do not remove orb if it's a latch that is being turned off
        if (activePointer.part !== 'latch') {
            this.orbManager?.removeOrb(pointerId);
        }
        this.activePointers.delete(pointerId);
    }
    
    public setBassLatch(isOn: boolean) {
        this.isBassLatchOn = isOn;
        if (!isOn) {
            this.nodes.get('latch')?.worklet.port.postMessage({ type: 'allNotesOff' });
            this.orbManager.removeAllOrbs('latch');
        }
    }
    
    public setBeatPattern(patternName: string) {
        if (!this.isInitialized) return;
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setPattern', pattern: patternName});
    }
    
    public setTempo(bpm: number) {
        if (!this.isInitialized) return;
        Tone.Transport.bpm.value = bpm;
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setTempo', bpm});
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized || !this.context) return;
        this.volumes = newVolumes;
        const rampTime = this.context.currentTime + 0.05;

        Object.entries(newVolumes).forEach(([part, db]) => {
            const nodeInfo = this.nodes.get(part as PartName);
            if (nodeInfo && part !== 'drums') {
                nodeInfo.gain.gain.linearRampToValueAtTime(dbToGain(db), rampTime);
            }
        });
        
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setVolume', volume: dbToGain(newVolumes.drums) });
    }
    
    public stopAllSounds() {
        if (!this.isInitialized) return;
        this.nodes.forEach(node => {
            node.worklet.port.postMessage({ type: 'allNotesOff' });
        });
        this.orbManager?.removeAllOrbs();
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
