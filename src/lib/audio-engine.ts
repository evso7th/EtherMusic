
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

type Effects = {
    melody: { reverb: number, delay: number };
    manualBass: { reverb: number, delay: number };
    latch: { reverb: number, delay: number };
    drums: { reverb: number, delay: number };
    autopilot: { reverb: number, delay: number };
    accompaniment: { reverb: number, delay: number };
    autopilotBass: { reverb: number, delay: number };
    effects: { reverb: number, delay: number };
};

type PartName = 'melody' | 'manualBass' | 'latch' | 'drums' | AutopilotPart;

/**
 * A modern, worklet-based audio engine for EtherMusic.
 * This engine acts as a central dispatcher and mixer.
 * It does not generate sound itself but manages and communicates with AudioWorkletNodes.
 */
export class AudioEngine {
    public isInitialized = false;
    private context!: Tone.Context;
    public orbManager!: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    // Audio Nodes
    private masterOut!: Tone.Gain;
    private effectInput!: Tone.Gain;
    private nodes = new Map<PartName, { worklet: AudioWorkletNode, gain: Tone.Gain }>();
    private fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };
    
    // Drum-specific properties
    private drumSamples: Record<string, AudioBuffer> = {};
    private isDrumSamplesLoaded = false;
    
    constructor() {}

    public async initialize() {
        if (this.isInitialized) return;

        await Tone.start();
        this.context = Tone.getContext();
        
        console.log('AudioContext started. Loading worklets and samples...');

        this.masterOut = new Tone.Gain(1).toDestination();
        this.effectInput = new Tone.Gain(1);
        
        this.fx = {
            reverb: new Tone.Reverb({ decay: 4, wet: 0.5 }).toDestination(),
            delay: new Tone.FeedbackDelay("8n", 0.25).toDestination()
        };
        
        this.effectInput.connect(this.fx.reverb);
        this.effectInput.connect(this.fx.delay);
        
        await this.loadDrumSamples();
        
        await this.context.audioWorklet.addModule('/worklets/poly-synth-processor.js');
        await this.context.audioWorklet.addModule('/worklets/drum-processor.js');

        this.createWorkletNode('melody');
        this.createWorkletNode('manualBass');
        this.createWorkletNode('latch');
        
        // Autopilot nodes will be created on demand
        this.createWorkletNode('autopilot');
        this.createWorkletNode('accompaniment');
        this.createWorkletNode('autopilotBass');
        this.createWorkletNode('effects');

        // Create drum machine node
        this.createDrumNode();
        
        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        this.isInitialized = true;
        console.log('AudioEngine initialized with Worklets.');
    }
    
    private createWorkletNode(part: PartName) {
        if (this.nodes.has(part)) return;

        const gainNode = new Tone.Gain(1);
        gainNode.connect(this.masterOut);
        gainNode.connect(this.effectInput);

        const workletNode = new AudioWorkletNode(this.context.rawContext, 'poly-synth-processor');
        workletNode.connect(gainNode);

        this.nodes.set(part, { worklet: workletNode, gain: gainNode });
        console.log(`Created worklet node for: ${part}`);
    }

    private async loadDrumSamples() {
        const sampleNames = ['kick_hard', 'kick_soft', 'kick_echo', 'kick', 'snare_hard', 'snare_soft', 'snare_verb', 'snare', 'snare_press', 'hat', 'hat_closed', 'hat_open'];
        const promises = sampleNames.map(async name => {
            const response = await fetch(`/assets/drums/${name}.wav`);
            const arrayBuffer = await response.arrayBuffer();
            this.drumSamples[name] = await this.context.decodeAudioData(arrayBuffer);
        });
        await Promise.all(promises);
        this.isDrumSamplesLoaded = true;
        console.log('All drum samples loaded.');
    }

    private createDrumNode() {
        if (this.nodes.has('drums') || !this.isDrumSamplesLoaded) return;
        
        const gainNode = new Tone.Gain(1);
        gainNode.connect(this.masterOut);
        gainNode.connect(this.effectInput);

        // We need to transfer the sample data to the worklet.
        // It must be in a format that can be handled by the structured clone algorithm.
        const transferableSamples: Record<string, ArrayBuffer> = {};
        for(const [name, audioBuffer] of Object.entries(this.drumSamples)) {
            // For simplicity, we send the raw Float32Array data for one channel.
            transferableSamples[name] = audioBuffer.getChannelData(0).buffer;
        }

        const workletNode = new AudioWorkletNode(this.context.rawContext, 'drum-processor', {
            processorOptions: { samples: transferableSamples }
        });
        workletNode.connect(gainNode);

        this.nodes.set('drums', { worklet: workletNode, gain: gainNode });
        console.log('Created worklet node for: drums');
    }

    public setOrbManager(orbManager: OrbManager) {
        this.orbManager = orbManager;
    }

    // --- Note Control ---
    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: { x: number, y: number }) {
        const part = type === 'bass' ? 'manualBass' : type;
        const node = this.nodes.get(part)?.worklet;
        node?.port.postMessage({ type: 'noteOn', pointerId, frequency: freq, volume: vol });

        if (this.isBassLatchOn) {
            this.nodes.get('latch')?.worklet.port.postMessage({ type: 'noteOn', pointerId, frequency: freq, volume: vol });
        }
        
        if (this.isBassLatchOn && type ==='bass') {
             this.orbManager?.addOrb(pointerId, 'latch', pos.x, pos.y);
        } else {
             this.orbManager?.addOrb(pointerId, type, pos.x, pos.y);
        }
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: { x: number, y: number }) {
        const part = type === 'bass' ? 'manualBass' : type;
        const node = this.nodes.get(part)?.worklet;
        node?.port.postMessage({ type: 'noteUpdate', pointerId, frequency: freq, volume: vol });
        this.orbManager?.updateOrb(pointerId, pos.x, pos.y);
    }

    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        const part = type === 'bass' ? 'manualBass' : type;
        const node = this.nodes.get(part)?.worklet;
        node?.port.postMessage({ type: 'noteOff', pointerId });
        this.orbManager?.removeOrb(pointerId);
    }
    
    private isBassLatchOn: boolean = false;
    public setBassLatch(isOn: boolean) {
        this.isBassLatchOn = isOn;
        const message = { type: 'latch', isOn };
        this.nodes.get('manualBass')?.worklet.port.postMessage(message);
        this.nodes.get('latch')?.worklet.port.postMessage(message);
        if (!isOn) {
            this.orbManager.removeAllOrbs('latch');
        }
    }

    // --- Autopilot ---
    public playWorkerNotesBatch(notes: NoteEvent[]) {
        if (!this.isInitialized) return;
        notes.forEach(note => {
            const nodeInfo = this.nodes.get(note.part);
            if (nodeInfo) {
                nodeInfo.worklet.port.postMessage({
                    type: 'noteOn',
                    pointerId: note.id ?? Math.random(), // Autopilot notes don't have a pointer
                    frequency: note.freq,
                    volume: note.vel,
                    // We don't pass time, as the worklet doesn't use Tone.Transport scheduling
                });
                // Note: The autopilot worker is responsible for sending noteOff messages
                // or we can implement a duration in the worklet itself.
                // For simplicity, we'll assume the worklet handles note duration.
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
                // Autopilot doesn't control volume via updates, only freq slides for now
            });
        }
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        const message = { type: 'setHarmony', key, scale };
        this.nodes.forEach(node => node.worklet.port.postMessage(message));
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
    
    public setVolumes(volumes: Volumes) {
        if (!this.isInitialized) return;
        const rampTime = this.context.currentTime + 0.05;
        this.nodes.get('melody')?.gain.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.melody), rampTime);
        this.nodes.get('manualBass')?.gain.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.manualBass), rampTime);
        this.nodes.get('latch')?.gain.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.latch), rampTime);
        this.nodes.get('drums')?.gain.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.drums), rampTime);
        this.nodes.get('autopilot')?.gain.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.autopilot), rampTime);
        this.nodes.get('accompaniment')?.gain.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.accompaniment), rampTime);
        this.nodes.get('autopilotBass')?.gain.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.autopilotBass), rampTime);
        this.effectInput.gain.linearRampToValueAtTime(Tone.dbToGain(volumes.effects), rampTime);
    }
    
    public setEffects(effects: Effects) {
         if (!this.isInitialized) return;
        const rampTime = this.context.currentTime + 0.05;

        // This is a simplified approach. A true per-instrument effect send would require
        // a separate gain node for each instrument's send channel. For now, we'll
        // just use the melody's effect settings as the global effect settings.
        this.fx.reverb.wet.linearRampToValueAtTime(Tone.dbToGain(effects.melody.reverb), rampTime);
        this.fx.delay.wet.linearRampToValueAtTime(Tone.dbToGain(effects.melody.delay), rampTime);
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
        if (!this.isInitialized || this.mediaRecorder?.state === 'recording') return;
        
        const dest = this.context.createMediaStreamDestination();
        this.masterOut.connect(dest); // Connect the master output to the recorder
        
        this.mediaRecorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
        this.recordedChunks = [];
        
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
        
        this.mediaRecorder.start();
        console.log("Recording started.");
    }
    
    public stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }
}

    