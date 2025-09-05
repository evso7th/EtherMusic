// src/lib/audio-engine.ts

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';
import { OrbManager } from './orb-manager';
import type { AutopilotPart, NoteEvent, NoteUpdateEvent } from './autopilot-worker';

// No longer includes effects
type Volumes = { 
    melody: number; 
    manualBass: number;
    latch: number; 
    drums: number; 
    autopilot: number;
    accompaniment: number;
    autopilotBass: number;
    effects: number; // Kept for type consistency, but effects are removed
};

type PartName = 'melody' | 'manualBass' | 'latch' | 'drums' | AutopilotPart;

// Helper to convert dB to gain, as Tone.dbToGain is no longer ideal
function dbToGain(db: number) {
    if (db <= -100) return 0; // Or a very small number to represent silence
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
    
    // Drum-specific properties
    private drumSamples: Record<string, AudioBuffer> = {};
    private isDrumSamplesLoaded = false;
    
    constructor() {}

    public async initialize() {
        if (this.isInitialized) return;

        // Still using Tone.start() for a reliable cross-browser way to start the context
        await Tone.start(); 
        const toneContext = Tone.getContext();
        this.context = toneContext.rawContext;
        
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
        
        await this.context.audioWorklet.addModule('/worklets/poly-synth-processor.js');
        await this.context.audioWorklet.addModule('/worklets/drum-processor.js');

        this.createWorkletNode('melody');
        this.createWorkletNode('manualBass');
        this.createWorkletNode('latch');
        
        this.createWorkletNode('autopilot');
        this.createWorkletNode('accompaniment');
        this.createWorkletNode('autopilotBass');
        this.createWorkletNode('effects');

        this.createDrumNode();
        
        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        this.isInitialized = true;
        console.log('AudioEngine initialized with native Web Audio API nodes.');
    }
    
    private createWorkletNode(part: PartName) {
        if (this.nodes.has(part)) return;

        const gainNode = this.context.createGain();
        gainNode.connect(this.masterOut);

        const workletNode = new AudioWorkletNode(this.context, 'poly-synth-processor');
        workletNode.connect(gainNode);

        this.nodes.set(part, { worklet: workletNode, gain: gainNode });
        console.log(`Created worklet node for: ${part}`);
    }

    private async loadDrumSamples() {
        const sampleNames = ['kick_hard', 'kick_soft', 'kick_echo', 'kick', 'snare_hard', 'snare_soft', 'snare_verb', 'snare', 'snare_press', 'hat', 'hat_closed', 'hat_open'];
        const toneContext = Tone.getContext();
        const promises = sampleNames.map(async name => {
            const response = await fetch(`/assets/drums/${name}.wav`);
            const arrayBuffer = await response.arrayBuffer();
            this.drumSamples[name] = await toneContext.decodeAudioData(arrayBuffer);
        });
        await Promise.all(promises);
        this.isDrumSamplesLoaded = true;
        console.log('All drum samples loaded.');
    }

    private createDrumNode() {
        if (this.nodes.has('drums') || !this.isDrumSamplesLoaded) return;
        
        const gainNode = this.context.createGain();
        gainNode.connect(this.masterOut);
        
        const transferableSamples: Record<string, { buffer: ArrayBuffer, sampleRate: number }> = {};
        for(const [name, audioBuffer] of Object.entries(this.drumSamples)) {
            transferableSamples[name] = {
                buffer: audioBuffer.getChannelData(0).buffer.slice(0), // slice to make it transferable
                sampleRate: audioBuffer.sampleRate
            };
        }
        
        const workletNode = new AudioWorkletNode(this.context, 'drum-processor', {
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
                    pointerId: note.id ?? Math.random(), 
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
        this.nodes.forEach(node => {
            if (node.worklet.name !== 'drum-processor') {
                node.worklet.port.postMessage(message);
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
    
    public setVolumes(volumes: Volumes) {
        if (!this.isInitialized) return;
        const rampTime = this.context.currentTime + 0.05;
        this.nodes.get('melody')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.melody), rampTime);
        this.nodes.get('manualBass')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.manualBass), rampTime);
        this.nodes.get('latch')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.latch), rampTime);
        this.nodes.get('drums')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.drums), rampTime);
        this.nodes.get('autopilot')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.autopilot), rampTime);
        this.nodes.get('accompaniment')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.accompaniment), rampTime);
        this.nodes.get('autopilotBass')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.autopilotBass), rampTime);
        // The "effects" gain now just acts as a master for effects, but we have no effects.
        // It can be removed or repurposed if effects are added back natively.
        // this.nodes.get('effects')?.gain.gain.linearRampToValueAtTime(dbToGain(volumes.effects), rampTime);
    }
    
    // Effects are removed. This method is now a no-op.
    public setEffects(effects: any) {
        // No-op
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