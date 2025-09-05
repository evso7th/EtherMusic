
// src/lib/audio-engine.ts

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';
import { OrbManager } from './orb-manager';
import type { AutopilotPart, NoteEvent, NoteUpdateEvent } from './autopilot-worker';

type Volumes = { 
    melody: number; 
    manualBass: number;
    latch: number; 
    drums: number; 
    autopilot: number;
    accompaniment: number;
    autopilotBass: number;
    effects: number;
};

type PartName = 'melody' | 'manualBass' | 'latch' | 'drums' | AutopilotPart;

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
    private masterOut!: GainNode;
    private nodes = new Map<PartName, { worklet: AudioWorkletNode, gain: GainNode }>();
    private volumes: Volumes;
    
    // Drum-specific properties
    private drumSamples: Record<string, AudioBuffer> = {};
    private isDrumSamplesLoaded = false;
    private toneContext: Tone.Context;

    constructor(toneContext: Tone.Context) {
        this.toneContext = toneContext;
        this.context = toneContext.rawContext;
        this.volumes = { melody: -6, manualBass: -6, latch: -15, drums: -9, autopilot: -10, accompaniment: -14, autopilotBass: -9, effects: -6 };
    }
    
    public getVolumes(): Volumes {
        return {...this.volumes};
    }

    public async initialize() {
        if (this.isInitialized) return;
        
        console.log('AudioContext started. Loading worklets and samples...');

        this.masterOut = this.context.createGain();
        this.masterOut.connect(this.context.destination);
        
        // Also connect to MediaRecorder destination if needed
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


        await this.loadDrumSamples();
        
        // Use a single, versatile polyphonic synth processor
        await this.context.audioWorklet.addModule('/worklets/poly-synth-processor.js');
        await this.context.audioWorklet.addModule('/worklets/drum-processor.js');

        // Create all synth nodes
        this.createWorkletNode('melody', 'poly-synth-processor');
        this.createWorkletNode('manualBass', 'poly-synth-processor');
        this.createWorkletNode('latch', 'poly-synth-processor');
        this.createWorkletNode('autopilot', 'poly-synth-processor');
        this.createWorkletNode('accompaniment', 'poly-synth-processor');
        this.createWorkletNode('autopilotBass', 'poly-synth-processor');
        this.createWorkletNode('effects', 'poly-synth-processor');

        // Create drum node
        this.createDrumNode();
        
        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        this.isInitialized = true;
        console.log('AudioEngine initialized with native Web Audio API nodes.');
    }
    
    private createWorkletNode(part: PartName, processorName: string) {
        if (this.nodes.has(part)) return;

        const gainNode = this.context.createGain();
        gainNode.connect(this.masterOut);

        const workletNode = new AudioWorkletNode(this.context, processorName, {
            // Pass the number of voices as a processor option
            processorOptions: {
                polyphony: part === 'melody' || part === 'manualBass' || part === 'latch' ? 3 : 8
            }
        });
        workletNode.connect(gainNode);

        this.nodes.set(part, { worklet: workletNode, gain: gainNode });
        console.log(`Created worklet node for: ${part}`);
    }

    private async loadDrumSamples() {
        // Corrected sample names based on logs. User to provide these files.
        const sampleNames = [
            'kick_hard', 'kick_soft', 'kick_echo', 'kick',
            'snare_hard', 'snare_soft', 'snare_verb', 'snare', 'snare_press',
            'hat', 'hat_closed', 'hat_open'
        ];
        const promises = sampleNames.map(async name => {
            try {
                const response = await fetch(`/assets/drums/${name}.wav`);
                if (!response.ok) throw new Error(`Sample ${name} not found`);
                const arrayBuffer = await response.arrayBuffer();
                this.drumSamples[name] = await this.toneContext.decodeAudioData(arrayBuffer);
            } catch (error) {
                console.warn(`Could not load drum sample: ${name}.wav`, error);
            }
        });
        await Promise.all(promises);
        this.isDrumSamplesLoaded = true;
        console.log('Finished attempting to load drum samples.');
    }

    private createDrumNode() {
        if (this.nodes.has('drums') || !this.isDrumSamplesLoaded) return;
        
        const gainNode = this.context.createGain();
        gainNode.connect(this.masterOut);
        
        const transferableSamples: { [key: string]: Float32Array } = {};
        for(const [name, audioBuffer] of Object.entries(this.drumSamples)) {
            // We need to send a Float32Array, not the ArrayBuffer, to the worklet
             transferableSamples[name] = audioBuffer.getChannelData(0);
        }
        
        const workletNode = new AudioWorkletNode(this.context, 'drum-processor', {
            processorOptions: { sampleRate: this.context.sampleRate }
        });
        
        workletNode.port.postMessage({ type: 'loadSamples', samples: transferableSamples });

        workletNode.connect(gainNode);

        this.nodes.set('drums', { worklet: workletNode, gain: gainNode });
        console.log('Created worklet node for: drums');
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

        if (!node || (type === 'bass' && this.isBassLatchOn)) {
            // For latch mode, don't stop the note on pointer up, it's stopped by a subsequent click
            if (type === 'melody') {
                 this.nodes.get('melody')?.worklet.port.postMessage({ type: 'noteOff', pointerId });
            }
        } else {
             node.port.postMessage({ type: 'noteOff', pointerId });
        }
        
        if (!(type === 'bass' && this.isBassLatchOn)) {
            this.orbManager?.removeOrb(pointerId);
        }
    }
    
    private isBassLatchOn: boolean = false;
    public setBassLatch(isOn: boolean) {
        this.isBassLatchOn = isOn;
        // The logic is now handled in start/update/stopNote, no message needed for worklet
        if (!isOn) {
            this.nodes.get('latch')?.worklet.port.postMessage({ type: 'allNotesOff' });
            this.orbManager.removeAllOrbs('latch');
        }
    }

    // --- Autopilot ---
    public playWorkerNotesBatch(notes: NoteEvent[]) {
        if (!this.isInitialized) return;
        notes.forEach(note => {
            const nodeInfo = this.nodes.get(note.part);
            if (nodeInfo) {
                // Autopilot notes are not triggered by a pointer, so use a random or sequential ID
                const autopilotPointerId = note.id ?? (Math.random() * 1e6);
                nodeInfo.worklet.port.postMessage({
                    type: 'noteOn',
                    pointerId: autopilotPointerId, 
                    frequency: note.freq,
                    volume: note.vel,
                });
            }
        });
    }

    public updateWorkerNote(note: NoteUpdateEvent) {
        if (!this.isInitialized) return;
        const nodeInfo = this.nodes.get(note.part);
        if (nodeInfo && note.id) {
             nodeInfo.worklet.port.postMessage({
                type: 'noteUpdate',
                pointerId: note.id,
                frequency: note.freq,
            });
        }
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        const message = { type: 'setHarmony', key, scale };
        this.nodes.forEach((nodeInfo, partName) => {
            if (partName !== 'drums') {
                nodeInfo.worklet.port.postMessage(message);
            }
        });
    }
    
    public setMelodyInstrument(instrument: Instrument) {
        this.nodes.get('melody')?.worklet.port.postMessage({ type: 'setInstrument', instrument });
    }
    
    public setBassInstrument(instrument: Instrument) {
        this.nodes.get('manualBass')?.worklet.port.postMessage({ type: 'setInstrument', instrument });
        this.nodes.get('latch')?.worklet.port.postMessage({ type: 'setInstrument', instrument });
    }

    public setAutopilotInstrument(part: AutopilotPart, instrument: Instrument) {
        this.nodes.get(part)?.worklet.port.postMessage({ type: 'setInstrument', instrument });
    }

    // --- Global Controls ---
    public setTempo(bpm: number) {
        if (this.isInitialized) {
            Tone.Transport.bpm.value = bpm;
            this.nodes.get('drums')?.worklet.port.postMessage({ type: 'setTempo', value: bpm });
        }
    }

    public setBeatPattern(patternName: string) {
        if (this.isInitialized) {
            this.nodes.get('drums')?.worklet.port.postMessage({ type: 'setPattern', value: patternName });
        }
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized) return;
        this.volumes = newVolumes;
        const rampTime = this.context.currentTime + 0.05;

        this.nodes.get('melody')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.melody), rampTime);
        this.nodes.get('manualBass')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.manualBass), rampTime);
        this.nodes.get('latch')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.latch), rampTime);
        this.nodes.get('drums')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.drums), rampTime);
        this.nodes.get('autopilot')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.autopilot), rampTime);
        this.nodes.get('accompaniment')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.accompaniment), rampTime);
        this.nodes.get('autopilotBass')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.autopilotBass), rampTime);
        this.nodes.get('effects')?.gain.gain.linearRampToValueAtTime(dbToGain(this.volumes.effects), rampTime);
    }
    
    public stopAllSounds() {
        if (!this.isInitialized) return;
        this.nodes.forEach(node => {
            // For synths, kill all notes. For drums, this will stop the sequence.
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
