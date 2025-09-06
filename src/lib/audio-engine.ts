// src/lib/audio-engine.ts

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale, Volumes } from '@/types';
import { OrbManager } from './orb-manager';

type PartName = 'melody' | 'manualBass' | 'latch' | 'drums';

// Helper to convert dB to gain
function dbToGain(db: number) {
    return Math.pow(10, db / 20);
}

/**
 * A modern, worklet-based audio engine for EtherMusic.
 * This engine acts as a central dispatcher and mixer.
 * It uses native Web Audio API nodes for mixing and routing.
 */
export class AudioEngine {
    public isInitialized = false;
    private context!: AudioContext;
    public orbManager!: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    // Audio Nodes
    public masterOut!: GainNode;
    private nodes = new Map<PartName, { worklet: AudioWorkletNode, gain: GainNode }>();
    private volumes: Volumes;
    private isBassLatchOn: boolean = false;
    
    constructor() {
        this.volumes = { melody: -6, manualBass: -6, latch: -15, drums: -9 };
    }
    
    public getVolumes(): Volumes {
        return {...this.volumes};
    }

    public async initialize() {
        if (this.isInitialized) return;
        
        console.log('AudioContext started. Loading worklets and samples...');
        
        this.context = Tone.getContext().rawContext as AudioContext;
        
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

            this.createWorkletNode('melody', 'theremin-processor');
            this.createWorkletNode('manualBass', 'theremin-processor');
            this.createWorkletNode('latch', 'theremin-processor');

            // Default instrument types
            this.setMelodyInstrument('theremin');
            this.setBassInstrument('synth');
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        this.isInitialized = true;
        console.log('AudioEngine initialized with native Web Audio API nodes.');
    }
    
    private createWorkletNode(part: PartName, processorName: string) {
        if (this.nodes.has(part)) return;

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

    public setOrbManager(orbManager: OrbManager) {
        this.orbManager = orbManager;
    }

    // --- Note Control ---
    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: { x: number, y: number }) {
        const part = type === 'bass' && this.isBassLatchOn ? 'latch' : (type === 'bass' ? 'manualBass' : type);
        const node = this.nodes.get(part)?.worklet;
        
        if (!node) return;
        
        const message = { type: 'noteOn', pointerId, frequency: freq, volume: vol };
        node.port.postMessage(message);

        const orbType = this.isBassLatchOn && type === 'bass' ? 'latch' : type;
        this.orbManager?.addOrb(pointerId, orbType, pos.x, pos.y);
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: { x: number, y: number }) {
        const part = type === 'bass' && this.isBassLatchOn ? 'latch' : (type === 'bass' ? 'manualBass' : type);
        const node = this.nodes.get(part)?.worklet;
        
        if (!node || (type === 'bass' && this.isBassLatchOn)) return;

        const message = { type: 'noteUpdate', pointerId, frequency: freq, volume: vol };
        node.port.postMessage(message);
        this.orbManager?.updateOrb(pointerId, pos.x, pos.y);
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        const part = type === 'bass' && this.isBassLatchOn ? 'latch' : (type === 'bass' ? 'manualBass' : type);
        const node = this.nodes.get(part)?.worklet;

        if (!node) return;

        if (type === 'bass' && this.isBassLatchOn) {
            // For latch mode, a click on an orb stops the note, which is handled as a 'noteOn' with the same freq.
            // The worklet will interpret this as a toggle.
        } else {
             node.port.postMessage({ type: 'noteOff', pointerId });
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

    public setMelodyInstrument(instrument: Instrument) {
        this.nodes.get('melody')?.worklet.port.postMessage({ type: 'setInstrument', instrument });
    }
    
    public setBassInstrument(instrument: Instrument) {
        this.nodes.get('manualBass')?.worklet.port.postMessage({ type: 'setInstrument', instrument });
        this.nodes.get('latch')?.worklet.port.postMessage({ type: 'setInstrument', instrument });
    }

    // --- Global Controls ---
    public setTempo(bpm: number) {
        if (this.isInitialized) {
            Tone.Transport.bpm.value = bpm;
        }
    }

    public setBeatPattern(patternName: string) {
        // This functionality is currently not implemented with the new worklet-based engine
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized) return;
        this.volumes = newVolumes;
        const rampTime = this.context.currentTime + 0.05;

        this.nodes.get('melody')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.melody), rampTime);
        this.nodes.get('manualBass')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.manualBass), rampTime);
        this.nodes.get('latch')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.latch), rampTime);
    }
    
    public stopAllSounds() {
        if (!this.isInitialized) return;
        this.nodes.forEach(node => {
            node.worklet.port.postMessage({ type: 'allNotesOff' });
        });
        this.orbManager?.removeAllOrbs();
    }
    
    // --- Recording ---
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
