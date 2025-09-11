
'use client';

import type { Volumes, Instrument, BassInstrument, CompressorSettings, BassInstrumentPresetParams, ChannelVolumes, SynthNote, WorkerMessage, DrumWorkerMessage, AudioEngineEvents } from '@/types';
import { OrbManager } from './orb-manager';
import { LatchEngine, type LatchToggleResult } from './latch-engine';
import { melodyInstruments } from './melody-presets';
import { bassInstruments } from './bass-presets';
import { DrumMachine } from './drum-machine';
import type { Emitter } from 'mitt';


function dbToGain(db: number): number {
    if (db <= -48) return 0;
    return Math.pow(10, db / 20);
}

function createDistortionCurve(amount: number): Float32Array {
    const k = Math.max(0, Math.min(100, amount)) * 2;
    if (k === 0) {
        return new Float32Array([ -1, 1 ]);
    }
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}


type SynthPartName = 'melody' | 'manualBass' | 'latch';

const DRUM_SAMPLES: Record<string, string> = {
    'k': '/assets/sounds/drums/kick_drum.wav',
    'K': '/assets/sounds/drums/kick_drum8.wav',
    's': '/assets/sounds/drums/snare.wav',
    'S': '/assets/sounds/drums/snare_off.wav',
    'h': '/assets/sounds/drums/closed_hi_hat_accented.wav',
    'H': '/assets/sounds/drums/closed_hi_hat_ghost.wav',
    'o': '/assets/sounds/drums/open_hh_top.wav',
    'O': '/assets/sounds/drums/open_hh_bottom.wav',
    'c': '/assets/sounds/drums/crash.wav',
    'y': '/assets/sounds/drums/cymbal.wav',
    'Y': '/assets/sounds/drums/cymbal_bell.wav',
    'Z': '/assets/sounds/drums/cymbal_bell2.wav',
    't': '/assets/sounds/drums/high_tom.wav',
    'T': '/assets/sounds/drums/mid_tom.wav',
    'l': '/assets/sounds/drums/low_tom.wav',
    'b': '/assets/sounds/drums/hh_bark_short.wav',
    // Percussion Samples
    'p1': '/assets/sounds/drums/perc-001.wav',
    'p2': '/assets/sounds/drums/perc-002.wav',
    'p3': '/assets/sounds/drums/perc-003.wav',
    'p4': '/assets/sounds/drums/perc-004.wav',
    'p5': '/assets/sounds/drums/perc-005.wav',
    'p6': '/assets/sounds/drums/perc-006.wav',
    'p7': '/assets/sounds/drums/perc-007.wav',
    'p8': '/assets/sounds/drums/perc-008.wav',
    'p9': '/assets/sounds/drums/perc-009.wav',
    'p10': '/assets/sounds/drums/perc-010.wav',
    'p11': '/assets/sounds/drums/perc-011.wav',
    'p12': '/assets/sounds/drums/perc-012.wav',
    'p13': '/assets/sounds/drums/perc-013.wav',
    'p14': '/assets/sounds/drums/perc-014.wav',
    'p15': '/assets/sounds/drums/perc-015.wav',
};


export class AudioEngine {
    public isInitialized = false;
    private context!: AudioContext;
    public orbManager: OrbManager;
    public emitter: Emitter<AudioEngineEvents>;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    private masterOut: GainNode;
    private preCompressorOut: GainNode;
    private limiter: DynamicsCompressorNode;
    
    private reverbSend: GainNode;
    private reverbReturnGain: GainNode;
    private convolver: ConvolverNode;
    
    private drumMachine: DrumMachine;

    private nodes = new Map<SynthPartName | 'drums', { 
        worklet: AudioWorkletNode, 
        gain: GainNode,
        reverbSend: GainNode,
        distortion?: WaveShaperNode,
    }>();
        
    private volumes!: Volumes;
    private isBassLatchOn: boolean = false;
    private latchEngine = new LatchEngine();
    
    private activePointers = new Map<number, { type: 'melody' | 'bass', noteId: number }>();
    private nextNoteId = 0;
    
    constructor(context: AudioContext, orbManager: OrbManager, emitter: Emitter<AudioEngineEvents>) {
        this.context = context;
        this.orbManager = orbManager;
        this.emitter = emitter;
        
        this.masterOut = this.context.createGain();
        this.masterOut.connect(this.context.destination);
        
        this.preCompressorOut = this.context.createGain();

        this.limiter = this.context.createDynamicsCompressor();
        this.preCompressorOut.connect(this.limiter);
        this.limiter.connect(this.masterOut);

        this.reverbSend = this.context.createGain();
        this.convolver = this.context.createConvolver();
        this.reverbReturnGain = this.context.createGain();
        this.reverbSend.connect(this.convolver);
        this.convolver.connect(this.reverbReturnGain);
        this.reverbReturnGain.connect(this.preCompressorOut);

        this.drumMachine = new DrumMachine(this, this.emitter);
    }
    
    getContext() {
        return this.context;
    }

    getDrumMachine() {
        return this.drumMachine;
    }

    public get isPlaying(): boolean {
        return this.drumMachine.isPlaying;
    }
    
    public getVolumes(): Volumes {
        return JSON.parse(JSON.stringify(this.volumes)); // Return a deep copy
    }
    
    public async initialize() {
        if (this.isInitialized) return;

        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
        
        const mediaStreamDest = this.context.createMediaStreamDestination();
        this.masterOut.connect(mediaStreamDest);
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
            const dateString = `${date.getFullYear()}${ (date.getMonth()+1).toString().padStart(2, '0') }${ date.getDate().toString().padStart(2, '0') }`;
            a.download = `EtherMusic-Session-${dateString}.webm`;
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            this.recordedChunks = [];
        };

        try {
             await Promise.all([
                this.context.audioWorklet.addModule('/workers/synth-processor.js'),
                this.context.audioWorklet.addModule('/workers/drum-processor.js'),
             ]);
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        this.createSynthChannel('melody', 10);
        this.createSynthChannel('manualBass', 4);
        this.createSynthChannel('latch', 4);
        
        this.createDrumChannel();
        
        await this.loadReverbImpulse();
        
        await this.loadDrumSamples();
                
        this.isInitialized = true;
    }

    private createSynthChannel(part: SynthPartName, polyphony: number) {
        if (!this.context) return;
        const worklet = new AudioWorkletNode(this.context, 'synth-processor', {
            processorOptions: { sampleRate: this.context.sampleRate, polyphony },
            outputChannelCount: [1]
        });

        const distortion = this.context.createWaveShaper();
        distortion.curve = createDistortionCurve(0);
        distortion.oversample = '4x';

        const gain = this.context.createGain();
        const reverbSend = this.context.createGain();
        
        worklet.connect(distortion).connect(gain);
        gain.connect(this.preCompressorOut);
        gain.connect(reverbSend).connect(this.reverbSend);
        
        worklet.port.onmessage = (e) => {
            if (e.data.type === 'debug') {
                console.log(`[DEBUG-${part.toUpperCase()}] ${e.data.message}`);
            } else if (e.data.type === 'error') {
                console.error(`[WORKLET-ERROR-${part.toUpperCase()}]`, e.data.message);
            }
        };

        this.nodes.set(part, { worklet, gain, reverbSend, distortion });
    }
    
    private createDrumChannel() {
        if (!this.context) return;
        const worklet = new AudioWorkletNode(this.context, 'drum-processor');
        const gain = this.context.createGain();
        const reverbSend = this.context.createGain();

        worklet.connect(gain);
        gain.connect(this.preCompressorOut);
        gain.connect(reverbSend).connect(this.reverbSend);
        
        worklet.port.onmessage = (e) => {
            if (e.data.type === 'error') {
                console.error('[DRUM WORKLET ERROR]', e.data.message);
            }
        };
        
        this.nodes.set('drums', { worklet, gain, reverbSend });
    }
    
    private async loadReverbImpulse() {
        try {
            const response = await fetch('/assets/sounds/impulses/space.wav');
            if (!response.ok) throw new Error('Reverb impulse not found');
            const arrayBuffer = await response.arrayBuffer();
            this.convolver.buffer = await this.context.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.warn("[AudioEngine] Reverb impulse '/assets/sounds/impulses/space.wav' not found. Using a generated fallback reverb. This is expected if the file doesn't exist.");
            this.convolver.buffer = this.createFallbackReverb();
        }
    }

    private createFallbackReverb(): AudioBuffer {
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * 1.5; 
        const impulse = this.context.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const n = length - i;
            left[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2.5);
            right[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2.5);
        }
        return impulse;
    }
    
    public stopAllSounds() {
        if (!this.isInitialized) return;
        this.drumMachine.stop();
        this.nodes.forEach((node, name) => {
            if (name !== 'drums') {
                node.worklet.port.postMessage({ type: 'allNotesOff' });
            }
        });
        
        const notesToTurnOff = this.latchEngine.clear();
        notesToTurnOff.forEach(note => this.orbManager.removeOrb(note.id));
        this.orbManager?.removeAllOrbs();
        this.activePointers.clear();
    }
    
    public handleThereminInteraction(type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') {
        if (!this.isInitialized) return;
        
        const partName = type === 'bass' ? (this.isBassLatchOn ? 'latch' : 'manualBass') : 'melody';
        console.log(`[Interaction] type: ${type}, state: ${state}, part: ${partName}, data:`, data);

        if (partName === 'latch') {
            if (state === 'down' && data) { 
                 const result = this.latchEngine.toggleNote(data);
                 console.log('[LatchEngine] toggle result:', result);
                 this.processLatchResult(result);
            }
            return;
        }

        const nodeInfo = this.nodes.get(partName);
        if (!nodeInfo) return;

        const pointerId = data ? data.pointerId : -1;
        
        if (state === 'down' && data) {
            const noteId = this.nextNoteId++;
            this.activePointers.set(pointerId, { type, noteId });
            const note: SynthNote = { id: noteId, frequency: data.frequency, volume: data.volume };
            const message: WorkerMessage = { type: 'noteOn', note };
            console.log(`[AudioEngine] -> ${partName} worklet:`, message);
            nodeInfo.worklet.port.postMessage(message);
            this.orbManager.addOrb(pointerId, type, data.x, data.y);
        } else if (state === 'move' && data) {
            const activePointer = this.activePointers.get(pointerId);
            if (activePointer) {
                 const note: SynthNote = { id: activePointer.noteId, frequency: data.frequency, volume: data.volume };
                 const message: WorkerMessage = { type: 'noteUpdate', note };
                 nodeInfo.worklet.port.postMessage(message);
                 this.orbManager.updateOrb(pointerId, data.x, data.y);
            }
        } else if (state === 'up') {
            const activePointer = this.activePointers.get(pointerId);
            if (activePointer) {
                const message: WorkerMessage = { type: 'noteOff', id: activePointer.noteId };
                console.log(`[AudioEngine] -> ${partName} worklet:`, message);
                nodeInfo.worklet.port.postMessage(message);
                this.activePointers.delete(pointerId);
                this.orbManager.removeOrb(pointerId);
            } else { 
                 this.activePointers.forEach((pInfo, pId) => {
                    if (pInfo.type === type) {
                        const nodeToStop = this.nodes.get(partName);
                        if (nodeToStop) {
                            const message: WorkerMessage = { type: 'noteOff', id: pInfo.noteId };
                            nodeToStop.port.postMessage(message);
                        }
                        this.orbManager.removeOrb(pId);
                        this.activePointers.delete(pId);
                    }
                });
            }
        }
    }

     private processLatchResult(result: LatchToggleResult) {
        const latchNode = this.nodes.get('latch');
        if (!latchNode) return;
        
        if (result.noteOff) {
            const message: WorkerMessage = { type: 'noteOff', id: result.noteOff.id };
            console.log(`[AudioEngine] -> LATCH worklet:`, message);
            latchNode.worklet.port.postMessage(message);
        }
        if (result.noteToAnimateRemove) {
            this.orbManager.removeOrb(result.noteToAnimateRemove.id);
        }
        
        if (result.noteOn) {
            const message: WorkerMessage = { type: 'noteOn', note: result.noteOn };
            console.log(`[AudioEngine] -> LATCH worklet:`, message);
            latchNode.worklet.port.postMessage(message);
        }
        if (result.noteToAnimateAdd) {
            this.orbManager.addOrb(result.noteToAnimateAdd.id, 'latch', result.noteToAnimateAdd.x, result.noteToAnimateAdd.y);
        }
    }
    
    public setBassLatch(isOn: boolean) {
        this.isBassLatchOn = isOn;
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
        if (preset && this.nodes.has('melody')) {
            const message: WorkerMessage = { type: 'setPreset', preset: preset.params };
            this.nodes.get('melody')?.worklet.port.postMessage(message);
        }
    }
    
    public setBassInstrument(instrumentName: BassInstrument): Volumes | undefined {
        const preset = bassInstruments.find(i => i.id === instrumentName);
        if (preset && this.volumes) {
            const newVolumes = JSON.parse(JSON.stringify(this.volumes)); // Deep copy
            const bassPresetParams = preset.params as BassInstrumentPresetParams;
            const message: WorkerMessage = { type: 'setPreset', preset: bassPresetParams };
            
            this.nodes.get('manualBass')?.worklet.port.postMessage(message);
            this.nodes.get('latch')?.worklet.port.postMessage(message);
            
            newVolumes.manualBass.reverbSend = bassPresetParams.reverbSend ?? newVolumes.manualBass.reverbSend;
            newVolumes.manualBass.distortion = bassPresetParams.distortion ?? newVolumes.manualBass.distortion;
            newVolumes.latch.reverbSend = bassPresetParams.reverbSend ?? newVolumes.latch.reverbSend;
            newVolumes.latch.distortion = bassPresetParams.distortion ?? newVolumes.latch.distortion;
            
            this.setVolumes(newVolumes);
            return newVolumes;
        }
        return undefined;
    }
    
    public setBeatPattern(patternName: string) {
        this.drumMachine.setPattern(patternName);
    }

    public setTempo(newTempo: number) {
        this.drumMachine.setTempo(newTempo);
    }

    public setSwing(swing: number) {
        this.drumMachine.setSwing(swing);
    }
    
    public playDrumSample(sampleName: string, volume: number = 1.0) {
        const drumNode = this.nodes.get('drums');
        if (!drumNode) {
            return;
        }
        const message: DrumWorkerMessage = { type: 'playSample', sampleName, volume };
        drumNode.worklet.port.postMessage(message);
    }
    
    private async loadDrumSamples(): Promise<void> {
        const drumWorklet = this.nodes.get('drums')?.worklet;
        if (!drumWorklet) {
            console.error("[AudioEngine] Drum worklet node not available for loading samples.");
            return;
        }

        const sampleEntries = Object.entries(DRUM_SAMPLES);

        for (const [name, url] of sampleEntries) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for ${url.split('/').pop()}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.context.decodeAudioData(arrayBuffer.slice(0)); 
                
                const channelData = audioBuffer.getChannelData(0);
                const message: DrumWorkerMessage = {
                    type: 'loadSample',
                    name,
                    buffer: channelData.buffer,
                };
                drumWorklet.port.postMessage(message, [channelData.buffer]);

            } catch (error) {
                console.error(`[AudioEngine] Failed to load or process drum sample: ${name}`, error);
            }
        }
    }

    private applyChannelSettings(partName: SynthPartName | 'drums', volumes: ChannelVolumes) {
        const nodeInfo = this.nodes.get(partName);
        if (nodeInfo && volumes) {
            nodeInfo.gain.gain.setTargetAtTime(dbToGain(volumes.gain), this.context.currentTime, 0.01);
            nodeInfo.reverbSend.gain.setTargetAtTime(dbToGain(volumes.reverbSend), this.context.currentTime, 0.01);
            if (nodeInfo.distortion) {
                nodeInfo.distortion.curve = createDistortionCurve(volumes.distortion);
            }
        }
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized || !this.context) return;
        this.volumes = newVolumes;

        this.applyChannelSettings('melody', newVolumes.melody);
        this.applyChannelSettings('manualBass', newVolumes.manualBass);
        this.applyChannelSettings('latch', newVolumes.latch);
        this.applyChannelSettings('drums', newVolumes.drums);
        
        this.reverbReturnGain.gain.setTargetAtTime(dbToGain(newVolumes.reverbReturn), this.context.currentTime, 0.02);
        this.setMasterLimiterSettings(newVolumes.compressor);

        if (newVolumes.swing !== undefined) {
            this.setSwing(newVolumes.swing);
        }
        if (newVolumes.tempo !== undefined) {
            this.setTempo(newVolumes.tempo);
        }
        this.emitter.emit('volumesChanged', this.getVolumes());
    }
    
    public setMasterLimiterSettings(compressorSettings: CompressorSettings) {
        if (!this.isInitialized || !this.context || !this.limiter) return;
        
        this.volumes.compressor = compressorSettings;
    
        // Disconnect and reconnect to apply the enabled/disabled state.
        this.preCompressorOut.disconnect();
        if (compressorSettings.enabled) {
            this.preCompressorOut.connect(this.limiter);
            this.limiter.connect(this.masterOut);

            const rampTime = this.context.currentTime + 0.02;
            // Set limiter properties. A high ratio and fast attack/release make it a "brickwall" limiter.
            this.limiter.threshold.setTargetAtTime(compressorSettings.threshold, this.context.currentTime, rampTime);
            this.limiter.knee.setTargetAtTime(0, this.context.currentTime, rampTime); // Hard knee for limiting
            this.limiter.ratio.setTargetAtTime(compressorSettings.ratio, this.context.currentTime, rampTime);
            this.limiter.attack.setTargetAtTime(compressorSettings.attack, this.context.currentTime, rampTime);
            this.limiter.release.setTargetAtTime(compressorSettings.release, this.context.currentTime, rampTime);
        } else {
            this.preCompressorOut.connect(this.masterOut);
        }
    }
    
    public startRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'recording') return;
        this.recordedChunks = [];
        this.mediaRecorder.start();
    }
    
    public stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }
}
