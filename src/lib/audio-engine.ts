
'use client';

import type { Volumes, Instrument, BassInstrument, CompressorSettings, InstrumentPreset, BassInstrumentPreset, ChannelVolumes, SynthNote, WorkerMessage, DrumWorkerMessage } from '@/types';
import { OrbManager } from './orb-manager';
import { LatchEngine, type LatchToggleResult } from './latch-engine';
import { melodyInstruments } from './melody-presets';
import { bassInstruments } from './bass-presets';
import { DrumMachine } from './drum-machine';


function dbToGain(db: number): number {
    if (db <= -48) return 0;
    return Math.pow(10, db / 20);
}

function createDistortionCurve(amount: number): Float32Array {
    const k = Math.max(0, Math.min(100, amount)) * 2;
    if (k === 0) {
        // Return a linear curve when distortion is 0 to avoid artifacts
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

type SynthPartName = 'melody' | 'manualBass' | 'latch' | 'drums';

const DRUM_SAMPLES: Record<string, string> = {
    'k': '/assets/sounds/drums/kick_drum.wav',
    's': '/assets/sounds/drums/snare.wav',
    'h': '/assets/sounds/drums/closed_hi_hat_accented.wav',
    'H': '/assets/sounds/drums/closed_hi_hat_ghost.wav',
    'c': '/assets/sounds/drums/crash.wav',
    'y': '/assets/sounds/drums/cymbal.wav',
    't': '/assets/sounds/drums/high_tom.wav',
    'T': '/assets/sounds/drums/mid_tom.wav',
    'l': '/assets/sounds/drums/low_tom.wav',
    'b': '/assets/sounds/drums/hh_bark_short.wav'
};

export class AudioEngine {
    public isInitialized = false;
    private context!: AudioContext;
    public orbManager: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    private masterOut: GainNode;
    private preCompressorOut: GainNode;
    private compressor: DynamicsCompressorNode;
    
    private reverbSend: GainNode;
    private reverbReturnGain: GainNode;
    private convolver: ConvolverNode;
    
    private drumMachine: DrumMachine;
    private drumWorklet: AudioWorkletNode | null = null;
    
    private nodes = new Map<SynthPartName, { 
        worklet: AudioWorkletNode, 
        gain: GainNode,
        reverbSend: GainNode,
        distortion?: WaveShaperNode,
    }>();
        
    private volumes: Volumes = { 
        melody: { gain: 0, reverbSend: -18, distortion: 0 },
        manualBass: { gain: -3, reverbSend: -48, distortion: 0 },
        latch: { gain: -9, reverbSend: -48, distortion: 0 },
        drums: { gain: -9, reverbSend: -48, distortion: 0 },
        reverbReturn: -12,
        compressor: {
            enabled: true,
            threshold: -24,
            ratio: 12,
            attack: 0.003,
            release: 0.25
        }
    };
    private isBassLatchOn: boolean = false;
    private latchEngine = new LatchEngine();
    
    private activePointers = new Map<number, { type: 'melody' | 'bass', noteId: number }>();
    private nextNoteId = 0;
    
    constructor(context: AudioContext, orbManager: OrbManager) {
        console.log("[AudioEngine] Constructor called.");
        this.context = context;
        this.orbManager = orbManager;
        
        this.masterOut = this.context.createGain();
        this.masterOut.connect(this.context.destination);
        
        this.preCompressorOut = this.context.createGain();

        this.compressor = this.context.createDynamicsCompressor();
        this.preCompressorOut.connect(this.compressor);
        this.compressor.connect(this.masterOut);

        this.reverbSend = this.context.createGain();
        this.convolver = this.context.createConvolver();
        this.reverbReturnGain = this.context.createGain();
        this.reverbSend.connect(this.convolver);
        this.convolver.connect(this.reverbReturnGain);
        this.reverbReturnGain.connect(this.preCompressorOut);

        this.drumMachine = new DrumMachine(this);
        console.log("[AudioEngine] DrumMachine instantiated.");

    }
    
    getContext() {
        return this.context;
    }

    public get isPlaying(): boolean {
        return this.drumMachine.isPlaying;
    }
    
    public getVolumes(): Volumes {
        return {...this.volumes};
    }
    
    public async initialize() {
        if (this.isInitialized) return;
        console.log("[AudioEngine] Initializing...");

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
            const dateString = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            a.download = `EtherMusic-Session-${dateString}.webm`;
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            this.recordedChunks = [];
        };

        try {
             await Promise.all([
                this.context.audioWorklet.addModule('workers/synth-processor.js'),
                this.context.audioWorklet.addModule('workers/drum-processor.js'),
             ]);
             console.log("[AudioEngine] synth-processor.js & drum-processor.js worklets added.");
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        this.loadReverbImpulse();

        this.createSynthChannel('melody', 10);
        this.createSynthChannel('manualBass', 4);
        this.createSynthChannel('latch', 4);
        console.log("[AudioEngine] Synth channels created.");
        
        this.createDrumChannel();
        
        this.setVolumes(this.volumes);
        
        this.isInitialized = true;
        console.log("[AudioEngine] Initialization complete.");
    }

    private createSynthChannel(part: 'melody' | 'manualBass' | 'latch', polyphony: number) {
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
        
        worklet.connect(distortion).connect(gain).connect(this.preCompressorOut);
        gain.connect(reverbSend).connect(this.reverbSend);
        
        worklet.port.onmessage = (e) => {
            if (e.data.type === 'error') {
                console.error(`[SYNTH-WORKLET-${part}]`, e.data.message);
            }
        };

        this.nodes.set(part, { worklet, gain, reverbSend, distortion });
    }
    
    private createDrumChannel() {
        if (!this.context) return;
        console.log('[AudioEngine] Creating drum channel.');

        this.drumWorklet = new AudioWorkletNode(this.context, 'drum-processor');
        const gain = this.context.createGain();
        const reverbSend = this.context.createGain();

        this.drumWorklet.connect(gain).connect(this.preCompressorOut);
        gain.connect(reverbSend).connect(this.reverbSend);
        
        this.drumWorklet.port.onmessage = (e) => {
            if (e.data.type === 'error') {
                console.error('[DRUM WORKLET ERROR]', e.data.message);
            }
        };
        
        this.nodes.set('drums', { worklet: this.drumWorklet, gain, reverbSend });

        this.loadDrumSamples().then(samples => {
            if (this.drumWorklet) {
                console.log('[AudioEngine] Posting loaded samples to drum worklet.');
                const transferableSamples = Object.entries(samples).map(([name, data]) => {
                    return { name, buffer: data.buffer };
                });
                const transferList = transferableSamples.map(s => s.buffer);
                this.drumWorklet.port.postMessage({ type: 'loadSamples', samples: transferableSamples }, transferList);
            }
        }).catch(err => {
            console.error("[AudioEngine] Error in loadDrumSamples promise chain:", err);
        });
    }
    
    private async loadReverbImpulse() {
        console.log("[AudioEngine] Loading reverb impulse...");
        this.convolver.buffer = this.createFallbackReverb();
        console.log("[AudioEngine] Fallback reverb created and assigned.");
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
    
    public play() {
        console.log("[AudioEngine] Play requested.");
        if (!this.isInitialized || this.isPlaying || !this.context) return;
        if (this.context.state === 'suspended') {
            this.context.resume();
        }
        this.drumMachine.play();
    }

    public pause() {
        console.log("[AudioEngine] Pause requested.");
        if (!this.isInitialized || !this.isPlaying) return;
        this.drumMachine.pause();
    }

    public stop() {
        this.drumMachine.stop();
        this.stopAllSounds();
    }
    
    public handleThereminInteraction(type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') {
        if (!this.isInitialized) return;
        
        const partName = type === 'bass' ? (this.isBassLatchOn ? 'latch' : 'manualBass') : 'melody';
        
        if (partName === 'latch') {
            if (state === 'down' && data) { 
                 const result = this.latchEngine.toggleNote(data);
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
                nodeInfo.worklet.port.postMessage(message);
                this.activePointers.delete(pointerId);
                this.orbManager.removeOrb(pointerId);
            } else { 
                 this.activePointers.forEach((pInfo, pId) => {
                    if (pInfo.type === type) {
                        const nodeToStop = this.nodes.get(partName);
                        if (nodeToStop) {
                            const message: WorkerMessage = { type: 'noteOff', id: pInfo.noteId };
                            nodeToStop.worklet.port.postMessage(message);
                        }
                        this.orbManager.removeOrb(pId);
                        this.activePointers.delete(pId);
                    }
                });
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
    
    public setBassInstrument(instrumentName: BassInstrument) {
        const preset = bassInstruments.find(i => i.id === instrumentName);
        if (preset) {
            const bassPresetParams = preset.params;
            const message: WorkerMessage = { type: 'setPreset', preset: bassPresetParams };
            
            this.nodes.get('manualBass')?.worklet.port.postMessage(message);
            this.nodes.get('latch')?.worklet.port.postMessage(message);
            
            const newVolumes = { ...this.volumes };
            if (bassPresetParams.reverbSend !== undefined) {
                newVolumes.manualBass.reverbSend = bassPresetParams.reverbSend;
                newVolumes.latch.reverbSend = bassPresetParams.reverbSend;
            }
            if (bassPresetParams.distortion !== undefined) {
                newVolumes.manualBass.distortion = bassPresetParams.distortion;
                newVolumes.latch.distortion = bassPresetParams.distortion;
            }

            this.setVolumes(newVolumes);
        }
    }
    
    public setBeatPattern(patternName: string) {
        console.log(`[AudioEngine] setBeatPattern called with: ${patternName}`);
        this.drumMachine.setPattern(patternName);
    }

    public setTempo(newTempo: number) {
        console.log(`[AudioEngine] setTempo called with: ${newTempo}`);
        this.drumMachine.setTempo(newTempo);
    }
    
    public playDrumSample(sampleName: string, volume: number = 1.0) {
        if (!this.drumWorklet) {
            console.error(`[AudioEngine] playDrumSample: drumWorklet is not available.`);
            return;
        }
        const message: DrumWorkerMessage = { type: 'playSample', sampleName, volume };
        console.log(`[AudioEngine] playDrumSample: posting message to 'drum-processor' worklet`, message);
        this.drumWorklet.port.postMessage(message);
    }
    
    private async loadDrumSamples(): Promise<Record<string, Float32Array>> {
        console.log("[AudioEngine] Loading drum samples...");
        
        const samples: Record<string, Float32Array> = {};
        const promises = Object.entries(DRUM_SAMPLES).map(async ([key, path]) => {
            try {
                const response = await fetch(path);
                if (!response.ok) {
                    const filename = path.split('/').pop();
                    throw new Error(`HTTP error! status: ${response.status} for ${filename}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
                samples[key] = audioBuffer.getChannelData(0);
                console.log(`[AudioEngine] Loaded sample: ${key}`);
            } catch (error) {
                console.error(`[AudioEngine] Failed to load or decode drum sample: ${path}`, error);
            }
        });

        await Promise.all(promises);
        console.log("[AudioEngine] All drum samples processed.");
        return samples;
    }

    private applyVolume(partName: keyof Omit<Volumes, 'compressor' | 'reverbReturn'>, volumes: ChannelVolumes) {
        const rampTime = this.context.currentTime + 0.05;
        const nodeInfo = this.nodes.get(partName);

        if (nodeInfo) {
            nodeInfo.gain.gain.linearRampToValueAtTime(dbToGain(volumes.gain), rampTime);
            nodeInfo.reverbSend.gain.linearRampToValueAtTime(dbToGain(volumes.reverbSend), rampTime);
            if (nodeInfo.distortion) {
                nodeInfo.distortion.curve = createDistortionCurve(volumes.distortion);
            }
        }
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized || !this.context) return;
        this.volumes = newVolumes;
        const rampTime = this.context.currentTime + 0.05;

        this.applyVolume('melody', newVolumes.melody);
        this.applyVolume('manualBass', newVolumes.manualBass);
        this.applyVolume('latch', newVolumes.latch);
        this.applyVolume('drums', newVolumes.drums);
        
        this.reverbReturnGain.gain.linearRampToValueAtTime(dbToGain(this.volumes.reverbReturn), rampTime);
        this.setCompressorSettings(this.volumes.compressor);
    }
    
    public setCompressorSettings(compressorSettings: CompressorSettings) {
        if (!this.isInitialized || !this.context || !this.compressor) return;
        this.volumes.compressor = compressorSettings;
        const rampTime = this.context.currentTime + 0.05;

        this.compressor.threshold.linearRampToValueAtTime(compressorSettings.threshold, rampTime);
        this.compressor.ratio.linearRampToValueAtTime(compressorSettings.ratio, rampTime);
        this.compressor.attack.linearRampToValueAtTime(compressorSettings.attack, rampTime);
        this.compressor.release.linearRampToValueAtTime(compressorSettings.release, rampTime);

        this.preCompressorOut.disconnect();
        if (compressorSettings.enabled) {
            this.preCompressorOut.connect(this.compressor);
            this.compressor.connect(this.masterOut);
        } else {
            this.preCompressorOut.connect(this.masterOut);
        }
    }
    
    public stopAllSounds() {
        if (!this.isInitialized) return;
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

    public fadeOutAndStop(durationSeconds: number) {
        if (!this.masterOut || !this.context) return;
        const now = this.context.currentTime;
        this.masterOut.gain.cancelScheduledValues(now);
        this.masterOut.gain.setValueAtTime(this.masterOut.gain.value, now);
        this.masterOut.gain.linearRampToValueAtTime(0, now + durationSeconds);
        setTimeout(() => {
            this.stop();
            if (this.masterOut && this.context) {
                 this.masterOut.gain.cancelScheduledValues(this.context.currentTime);
                 this.masterOut.gain.setValueAtTime(1, this.context.currentTime);
            }
        }, (durationSeconds + 0.5) * 1000);
    }
}
