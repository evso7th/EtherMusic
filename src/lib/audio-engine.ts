
"use client";

import * as Tone from 'tone';
import type { Volumes, Note, Instrument, BassInstrument } from '@/types';
import { OrbManager } from './orb-manager';
import { LatchEngine, type LatchToggleResult } from './latch-engine';
import { melodyInstruments } from './melody-presets';
import { bassInstruments } from './bass-presets';

type PartName = 'melody' | 'manualBass' | 'latch' | 'drums';

function dbToGain(db: number): number {
    if (db <= -48) return 0;
    return Math.pow(10, db / 20);
}

export class AudioEngine {
    public isInitialized = false;
    private context: AudioContext;
    public orbManager: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    public masterOut: Tone.Gain;
    private compressor: Tone.Compressor | null = null;
    private nodes = new Map<PartName, { worklet: AudioWorkletNode, gain: Tone.Gain, reverbSend: Tone.Gain }>();
    private reverbReturn: Tone.Gain;

    private volumes: Volumes = { 
        melody: { gain: 6, reverbSend: -24 },
        manualBass: { gain: 6, reverbSend: -48 },
        latch: { gain: -15, reverbSend: -48 },
        drums: { gain: -9, reverbSend: -48 },
        reverbReturn: -12,
    };
    private isBassLatchOn: boolean = false;
    private latchEngine = new LatchEngine();
    
    private activePointers = new Map<number, { type: 'melody' | 'bass' }>();

    private _isPlaying = false;
    private animationFrameId: number | null = null;

    private Tone: typeof import('tone') | null = null;

    constructor(context: AudioContext, orbManager: OrbManager) {
        this.context = context;
        this.orbManager = orbManager;
        // The masterOut needs to be a Tone.Gain node to be connectable to Tone.Compressor
        this.masterOut = new Tone.Gain(1).toDestination();
        this.reverbReturn = new Tone.Gain(1);
    }

    public get isPlaying(): boolean {
        return this._isPlaying;
    }
    
    public getVolumes(): Volumes {
        return {...this.volumes};
    }

    public async initialize() {
        if (this.isInitialized) return;

        // Use the passed-in context to initialize Tone.js
        await Tone.setContext(this.context).ready();
        console.log("AudioContext is active.");
        
        this.compressor = new Tone.Compressor(-24, 12).toDestination();
        this.masterOut.connect(this.compressor);

        const mediaStreamDest = this.context.createMediaStreamDestination();
        this.masterOut.connect(mediaStreamDest); // Connect master output to recorder
        this.mediaRecorder = new MediaRecorder(mediaStreamDest.stream, { mimeType: 'audio/webm' });
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) this.recordedChunks.push(event.data);
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
             await this.context.audioWorklet.addModule('/worklets/latch-processor.js');
             await this.context.audioWorklet.addModule('/worklets/drum-processor.js');
             await this.context.audioWorklet.addModule('/worklets/reverb-processor.js');
             console.log('AudioWorklet modules loaded.');
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        const reverbBus = new AudioWorkletNode(this.context, 'reverb-processor');
        this.reverbReturn.connect(this.masterOut);
        reverbBus.connect(this.reverbReturn);
        
        this.createWorkletNode('melody', 'theremin-processor', 4, reverbBus);
        this.createWorkletNode('manualBass', 'theremin-processor', 4, reverbBus);
        this.createWorkletNode('latch', 'latch-processor', 4, reverbBus);
        this.createWorkletNode('drums', 'drum-processor', 8, reverbBus);

        this.setVolumes(this.volumes);
        this.setTempo(90);
        
        this.isInitialized = true;
        console.log('AudioEngine initialized and ready.');
    }
    
    private createWorkletNode(part: PartName, processorName: string, polyphony: number, reverbBus: AudioWorkletNode) {
        if (!this.context || !this.masterOut) return;
        
        const gainNode = new Tone.Gain(1).connect(this.masterOut);

        const reverbSendNode = new Tone.Gain(0).connect(reverbBus);

        const workletNode = new AudioWorkletNode(this.context, processorName, {
            processorOptions: {
                sampleRate: this.context.sampleRate,
                polyphony,
            },
            outputChannelCount: [1]
        });
        workletNode.connect(gainNode);
        workletNode.connect(reverbSendNode);

        this.nodes.set(part, { worklet: workletNode, gain: gainNode, reverbSend: reverbSendNode });
        console.log(`Created worklet node for: ${part}`);
    }

    private tick() {
        if (!this._isPlaying) return;
        this.animationFrameId = requestAnimationFrame(() => this.tick());
    }
    
    public play() {
        if (!this.isInitialized || this._isPlaying || !this.context) return;
        
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        this._isPlaying = true;
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'start'});
        if (this.animationFrameId === null) {
            this.tick();
        }
    }

    public pause() {
        if (!this.isInitialized || !this._isPlaying) return;
        this._isPlaying = false;
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'stop'});
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    public stop() {
        this.pause();
        this.stopAllSounds();
    }

    public handleThereminInteraction(type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') {
        if (!this.isInitialized || !this.context) return;

        const partName = type === 'bass' ? (this.isBassLatchOn ? 'latch' : 'manualBass') : 'melody';
        
        if (partName === 'latch') {
            if (state === 'down' && data) { 
                 const result = this.latchEngine.toggleNote(data);
                 this.processLatchResult(result);
            }
            return;
        }

        const node = this.nodes.get(partName)?.worklet;
        if (!node) return;

        if (!data) {
             this.activePointers.forEach((pointerInfo, pointerId) => {
                if (pointerInfo.type === type) {
                    node.port.postMessage({ type: 'noteOff', id: pointerId });
                    this.orbManager.removeOrb(pointerId);
                    this.activePointers.delete(pointerId);
                }
            });
            return;
        }

        if (state === 'down') {
            this.activePointers.set(data.pointerId, { type });
            node.port.postMessage({ type: 'noteOn', note: { id: data.pointerId, frequency: data.frequency, volume: data.volume } });
            this.orbManager.addOrb(data.pointerId, type, data.x, data.y);
        } else if (state === 'move') {
            if (this.activePointers.has(data.pointerId)) {
                node.port.postMessage({ type: 'noteUpdate', note: { id: data.pointerId, frequency: data.frequency, volume: data.volume } });
                this.orbManager.updateOrb(data.pointerId, data.x, data.y);
            }
        } else if (state === 'up') {
            if (this.activePointers.has(data.pointerId)) {
                node.port.postMessage({ type: 'noteOff', id: data.pointerId });
                this.activePointers.delete(data.pointerId);
                this.orbManager.removeOrb(data.pointerId);
            }
        }
    }

     private processLatchResult(result: LatchToggleResult) {
        const latchNode = this.nodes.get('latch')?.worklet;
        if (!latchNode) return;
        
        if (result.noteOff) {
            latchNode.port.postMessage({ type: 'noteOff', id: result.noteOff.id });
        }
        if (result.noteToAnimateRemove) {
            this.orbManager.removeOrb(result.noteToAnimateRemove.id);
        }
        
        if (result.noteOn) {
            latchNode.port.postMessage({ type: 'noteOn', note: result.noteOn });
        }
        if (result.noteToAnimateAdd) {
            this.orbManager.addOrb(result.noteToAnimateAdd.id, 'latch', result.noteToAnimateAdd.x, result.noteToAnimateAdd.y);
        }
    }
    
    public setBassLatch(isOn: boolean) {
        this.isBassLatchOn = isOn;
        // Stop manual bass notes when switching to latch
        this.nodes.get('manualBass')?.worklet.port.postMessage({ type: 'allNotesOff' });
        this.orbManager.removeAllOrbs('bass');
        
        if (!isOn) {
            const notesToTurnOff = this.latchEngine.clear();
            const latchNode = this.nodes.get('latch')?.worklet;
            if (latchNode) {
                notesToTurnOff.forEach(note => {
                    latchNode.port.postMessage({ type: 'noteOff', id: note.id });
                    this.orbManager.removeOrb(note.id);
                });
            }
        }
    }

    public setMelodyInstrument(instrumentName: Instrument) {
        const preset = melodyInstruments.find(p => p.id === instrumentName);
        if (preset) {
            this.nodes.get('melody')?.worklet.port.postMessage({ type: 'setPreset', preset: preset.params });
        }
    }
    
    public setBassInstrument(instrumentName: BassInstrument) {
        const preset = bassInstruments.find(p => p.id === instrumentName);
        if (preset) {
            this.nodes.get('manualBass')?.worklet.port.postMessage({ type: 'setPreset', preset: preset.params });
            this.nodes.get('latch')?.worklet.port.postMessage({ type: 'setPreset', preset: preset.params });
        }
    }
    
    public setBeatPattern(patternName: string) {
        if (!this.isInitialized) return;
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setPattern', pattern: patternName});
    }
    
    public setTempo(bpm: number) {
        if (!this.isInitialized) return;
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setTempo', bpm});
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized || !this.context) return;
        this.volumes = newVolumes;
        const rampTime = this.context.currentTime + 0.05;

        (Object.keys(newVolumes) as Array<keyof Volumes>).forEach((part) => {
            if (part === 'reverbReturn') {
                this.reverbReturn.gain.linearRampToValueAtTime(dbToGain(newVolumes.reverbReturn), rampTime);
            } else {
                 const partName = part as PartName;
                 const nodeInfo = this.nodes.get(partName);
                 if (nodeInfo) {
                    const gainValue = dbToGain(newVolumes[partName].gain);
                    nodeInfo.gain.gain.linearRampToValueAtTime(gainValue, rampTime);
                    
                    const reverbSendValue = dbToGain(newVolumes[partName].reverbSend);
                    nodeInfo.reverbSend.gain.linearRampToValueAtTime(reverbSendValue, rampTime);
                 }
            }
        });
    }
    
    public stopAllSounds() {
        if (!this.isInitialized) return;
        this.nodes.forEach(node => {
            node.worklet.port.postMessage({ type: 'allNotesOff' });
        });
        const notesToTurnOff = this.latchEngine.clear();
        notesToTurnOff.forEach(note => this.orbManager.removeOrb(note.id));
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

    public fadeOutAndStop(durationSeconds: number) {
        if (!this.masterOut || !this.context) return;
        this.masterOut.gain.linearRampToValueAtTime(0, this.context.currentTime + durationSeconds);
        setTimeout(() => {
            this.stop();
            if (this.masterOut && this.context) {
                this.masterOut.gain.setValueAtTime(1, this.context.currentTime);
            }
        }, (durationSeconds + 0.5) * 1000);
    }
}
