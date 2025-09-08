
'use client';

import type { Volumes, Note, Instrument, BassInstrument, CompressorSettings, InstrumentPreset, BassInstrumentPreset, ChannelVolumes, AutopilotSettings, AutopilotWorkerResponse, AutopilotWorkerMessage } from '@/types';
import { OrbManager } from './orb-manager';
import { LatchEngine, type LatchToggleResult } from './latch-engine';
import { melodyInstruments } from './melody-presets';
import { bassInstruments } from './bass-presets';

function dbToGain(db: number): number {
    if (db <= -48) return 0;
    return Math.pow(10, db / 20);
}

function createDistortionCurve(amount: number): Float32Array {
    const k = Math.max(0, Math.min(100, amount)) * 2;
    if (k === 0) {
      const curve = new Float32Array(2);
      curve[0] = 0;
      curve[1] = 0;
      return curve;
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

type SynthPartName = 'melody' | 'manualBass' | 'latch' | 'autopilotMelody' | 'autopilotAccompaniment' | 'autopilotBass';


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
    
    private drumWorklet: AudioWorkletNode | null = null;
    private drumGain: GainNode | null = null;
    private drumReverbSend: GainNode | null = null;
    
    private autopilotWorker: Worker | null = null;

    private nodes = new Map<SynthPartName, { 
        worklet: AudioWorkletNode, 
        gain: GainNode,
        reverbSend: GainNode,
        distortion: WaveShaperNode,
    }>();
    
    private autopilotSettings: AutopilotSettings | null = null;
    
    private volumes: Volumes = { 
        melody: { gain: 0, reverbSend: -18, distortion: 0 },
        manualBass: { gain: -3, reverbSend: -48, distortion: 0 },
        latch: { gain: -9, reverbSend: -48, distortion: 0 },
        drums: { gain: -9, reverbSend: -48, distortion: 0 },
        reverbReturn: -12,
        autopilotMelody: { gain: -6, reverbSend: -18, distortion: 0 },
        autopilotAccompaniment: { gain: -9, reverbSend: -12, distortion: 0 },
        autopilotBass: { gain: -9, reverbSend: -24, distortion: 0 },
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

    private _isPlaying = false;
    private mainLoop: NodeJS.Timeout | null = null;
    private tempo = 90;
    private current16thNote = 0;
    private nextNoteTime = 0.0;
    private lookahead = 25.0; // How frequently to call scheduling function (in milliseconds)
    private scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)

    constructor(context: AudioContext, orbManager: OrbManager) {
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
    }
    
    getContext() {
        return this.context;
    }

    public get isPlaying(): boolean {
        return this._isPlaying;
    }
    
    public getVolumes(): Volumes {
        return {...this.volumes};
    }

    public getAutopilotSettings(): AutopilotSettings | null {
        return this.autopilotSettings;
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
            const dateString = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
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
             this.autopilotWorker = new Worker(new URL('../lib/workers/autopilot.worker.js', import.meta.url));
             this.autopilotWorker.onmessage = this.handleAutopilotMessage.bind(this);
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        await this.loadReverbImpulse();

        this.createSynthChannel('melody', 10);
        this.createSynthChannel('manualBass', 4);
        this.createSynthChannel('latch', 4);
        this.createSynthChannel('autopilotMelody', 10);
        this.createSynthChannel('autopilotAccompaniment', 10);
        this.createSynthChannel('autopilotBass', 4);
        this.createDrumChannel();

        this.setVolumes(this.volumes);
        
        this.isInitialized = true;
    }
    
    private scheduler() {
        while (this.nextNoteTime < this.context.currentTime + this.scheduleAheadTime ) {
            const message: AutopilotWorkerMessage = {
                type: 'tick',
                time: this.nextNoteTime,
                beatNumber: this.current16thNote,
            };
            this.autopilotWorker?.postMessage(message);
            
            const secondsPerBeat = 60.0 / this.tempo;
            this.nextNoteTime += 0.25 * secondsPerBeat; // Advance by a 16th note
    
            this.current16thNote = (this.current16thNote + 1) % 16;
        }
    }

    private handleAutopilotMessage(event: MessageEvent<AutopilotWorkerResponse>) {
        const { type, score, time } = event.data;
        if (type === 'score') {
           this.scheduleAutopilotScore(score, time);
        }
    }
    
    private scheduleAutopilotScore(score: any, time: number) {
        if (!this.isInitialized) return;
        score.bass?.forEach((note: any) => this.playAutopilotNote('autopilotBass', note, time));
        score.accompaniment?.forEach((note: any) => this.playAutopilotNote('autopilotAccompaniment', note, time));
        score.melody?.forEach((note: any) => this.playAutopilotNote('autopilotMelody', note, time));
        score.sparkle?.forEach((note: any) => this.playAutopilotNote('melody', note, time, true));
    }
    
    private playAutopilotNote(part: SynthPartName, note: any, time: number, isSparkle = false) {
        const nodeInfo = this.nodes.get(part);
        if (nodeInfo) {
            const noteId = this.nextNoteId++;
            const volume = isSparkle ? (note.volume * 0.5) : note.volume;
            nodeInfo.worklet.port.postMessage({
                type: 'noteOn',
                note: {
                    id: noteId,
                    frequency: note.frequency,
                    volume: volume,
                    duration: note.duration,
                    time: time + note.time,
                }
            });
            if (isSparkle) {
                this.orbManager.addTempOrb(note.x, note.y, 'melody');
            }
        }
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
        
        worklet.connect(distortion).connect(gain).connect(this.preCompressorOut);
        gain.connect(reverbSend).connect(this.reverbSend);

        this.nodes.set(part, { worklet, gain, reverbSend, distortion });
    }
    
    private createDrumChannel() {
        if (!this.context) return;

        this.drumWorklet = new AudioWorkletNode(this.context, 'drum-processor', {
            processorOptions: { sampleRate: this.context.sampleRate, polyphony: 8 }
        });
        this.drumGain = this.context.createGain();
        this.drumReverbSend = this.context.createGain();

        this.drumWorklet.connect(this.drumGain).connect(this.preCompressorOut);
        this.drumGain.connect(this.drumReverbSend).connect(this.reverbSend);
    }
    
    private async loadReverbImpulse() {
        try {
            const response = await fetch('/assets/impulse/reverb.wav');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
            this.convolver.buffer = audioBuffer;
        } catch (e) {
            console.warn('Could not load impulse response. Using a fallback reverb.', e);
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
    
    public play() {
        if (!this.isInitialized || this._isPlaying || !this.context) return;
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        this._isPlaying = true;
        this.nextNoteTime = this.context.currentTime;
        this.current16thNote = 0;

        this.drumWorklet?.port.postMessage({type: 'start', bpm: this.tempo, startTime: this.context.currentTime });
        this.autopilotWorker?.postMessage({ type: 'start' } as AutopilotWorkerMessage);

        if (this.mainLoop === null) {
            this.scheduler(); 
            this.mainLoop = setInterval(() => this.scheduler(), this.lookahead);
        }
    }

    public pause() {
        if (!this.isInitialized || !this._isPlaying) return;
        this._isPlaying = false;

        this.drumWorklet?.port.postMessage({type: 'stop'});
        this.autopilotWorker?.postMessage({ type: 'stop' } as AutopilotWorkerMessage);
        
        if (this.mainLoop !== null) {
            clearInterval(this.mainLoop);
            this.mainLoop = null;
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

        const nodeInfo = this.nodes.get(partName);
        if (!nodeInfo) return;

        const pointerId = data ? data.pointerId : -1;
        
        if (state === 'down' && data) {
            const noteId = this.nextNoteId++;
            this.activePointers.set(pointerId, { type, noteId });
            nodeInfo.worklet.port.postMessage({ type: 'noteOn', note: { id: noteId, frequency: data.frequency, volume: data.volume } });
            this.orbManager.addOrb(pointerId, type, data.x, data.y);
        } else if (state === 'move' && data) {
            const activePointer = this.activePointers.get(pointerId);
            if (activePointer) {
                 nodeInfo.worklet.port.postMessage({ type: 'noteUpdate', note: { id: activePointer.noteId, frequency: data.frequency, volume: data.volume } });
                 this.orbManager.updateOrb(pointerId, data.x, data.y);
            }
        } else if (state === 'up') {
            const activePointer = this.activePointers.get(pointerId);
            if (activePointer) {
                nodeInfo.worklet.port.postMessage({ type: 'noteOff', id: activePointer.noteId });
                this.activePointers.delete(pointerId);
                this.orbManager.removeOrb(pointerId);
            } else { // Handle case where pointer is released outside the pad
                 this.activePointers.forEach((pInfo, pId) => {
                    if (pInfo.type === type) {
                        const nodeToStop = this.nodes.get(partName);
                        nodeToStop?.worklet.port.postMessage({ type: 'noteOff', id: pInfo.noteId });
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
            this.nodes.get('melody')?.worklet.port.postMessage({ type: 'setPreset', preset: preset.params });
        }
    }
    
    public setBassInstrument(instrumentName: BassInstrument) {
        const preset = bassInstruments.find(p => p.id === instrumentName);
        if (preset) {
            const bassPresetParams = preset.params;
            this.nodes.get('manualBass')?.worklet.port.postMessage({ type: 'setPreset', preset: bassPresetParams });
            this.nodes.get('latch')?.worklet.port.postMessage({ type: 'setPreset', preset: bassPresetParams });
            
             // Also update the volume settings for the new bass instrument
            const newVolumes = { ...this.volumes };
            newVolumes.manualBass.reverbSend = bassPresetParams.reverbSend;
            newVolumes.manualBass.distortion = bassPresetParams.distortion;
            newVolumes.latch.reverbSend = bassPresetParams.reverbSend;
            newVolumes.latch.distortion = bassPresetParams.distortion;
            this.setVolumes(newVolumes);
        }
    }
    
    public setBeatPattern(patternName: string) {
        if (!this.isInitialized) return;
        this.drumWorklet?.port.postMessage({type: 'setPattern', pattern: patternName});
    }

    public setTempo(newTempo: number) {
        this.tempo = newTempo;
        this.drumWorklet?.port.postMessage({type: 'setBpm', bpm: this.tempo });
        this.autopilotWorker?.postMessage({ type: 'setBpm', bpm: this.tempo } as AutopilotWorkerMessage);
    }
    
    private applyVolume(partName: keyof Volumes, volumes: ChannelVolumes) {
        const nodeInfo = this.nodes.get(partName as any);
        const rampTime = this.context.currentTime + 0.05;

        if (partName === 'drums') {
             if (this.drumGain && this.drumReverbSend) {
                this.drumGain.gain.linearRampToValueAtTime(dbToGain(volumes.gain), rampTime);
                this.drumReverbSend.gain.linearRampToValueAtTime(dbToGain(volumes.reverbSend), rampTime);
            }
        } else if (nodeInfo) {
            nodeInfo.gain.gain.linearRampToValueAtTime(dbToGain(volumes.gain), rampTime);
            nodeInfo.reverbSend.gain.linearRampToValueAtTime(dbToGain(volumes.reverbSend), rampTime);
            nodeInfo.distortion.curve = createDistortionCurve(volumes.distortion);
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
        if (newVolumes.autopilotMelody) this.applyVolume('autopilotMelody', newVolumes.autopilotMelody);
        if (newVolumes.autopilotAccompaniment) this.applyVolume('autopilotAccompaniment', newVolumes.autopilotAccompaniment);
        if (newVolumes.autopilotBass) this.applyVolume('autopilotBass', newVolumes.autopilotBass);

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
    
    public setAutopilotSettings(settings: Partial<AutopilotSettings>) {
        if (!this.autopilotWorker) return;
        
        const previousSettings = this.autopilotSettings ?? {};
        this.autopilotSettings = { ...previousSettings, ...settings };

        this.autopilotWorker.postMessage({ type: 'updateSettings', settings: this.autopilotSettings } as AutopilotWorkerMessage);

        if (settings.instruments) {
            const melodyPreset = melodyInstruments.find(p => p.id === settings.instruments?.melody)?.params;
            if(melodyPreset) this.nodes.get('autopilotMelody')?.worklet.port.postMessage({ type: 'setPreset', preset: melodyPreset });

            const accompanimentPreset = melodyInstruments.find(p => p.id === settings.instruments?.accompaniment)?.params;
             if(accompanimentPreset) this.nodes.get('autopilotAccompaniment')?.worklet.port.postMessage({ type: 'setPreset', preset: accompanimentPreset });

            const bassPreset = bassInstruments.find(p => p.id === settings.instruments?.bass)?.params;
             if(bassPreset) {
                this.nodes.get('autopilotBass')?.worklet.port.postMessage({ type: 'setPreset', preset: bassPreset });
                
                if (this.volumes.autopilotBass) {
                    const newVolumes = {...this.volumes};
                    newVolumes.autopilotBass.reverbSend = bassPreset.reverbSend;
                    newVolumes.autopilotBass.distortion = bassPreset.distortion;
                    this.setVolumes(newVolumes);
                }
             }
        }
    }

    public stopAllSounds() {
        if (!this.isInitialized) return;
        this.nodes.forEach(node => {
            node.worklet.port.postMessage({ type: 'allNotesOff' });
        });
        this.drumWorklet?.port.postMessage({type: 'stop'});
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
