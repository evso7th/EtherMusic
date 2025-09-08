
'use client';

import type { Volumes, Note, Instrument, BassInstrument, CompressorSettings, ChannelVolumes } from '@/types';
import { OrbManager } from './orb-manager';
import { LatchEngine, type LatchToggleResult } from './latch-engine';
import { melodyInstruments } from './melody-presets';
import { bassInstruments } from './bass-presets';

type PartName = 'melody' | 'manualBass' | 'latch' | 'drums';

function dbToGain(db: number): number {
    if (db <= -48) return 0;
    return Math.pow(10, db / 20);
}

function distortionAmountToGain(amount: number): number {
    // This maps the 0-100 slider to a gain value for the distortion effect.
    // Let's use a non-linear curve to make it more expressive.
    return Math.pow(amount / 100, 2);
}


export class AudioEngine {
    public isInitialized = false;
    private context!: AudioContext;
    public orbManager: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    private masterOut: GainNode;
    private preCompressorOut: GainNode;
    private compressor: DynamicsCompressorNode;
    private nodes = new Map<PartName, { 
        worklet: AudioWorkletNode, 
        gain: GainNode, 
        reverbSend: GainNode,
        distortionSend: GainNode,
    }>();
    private reverbReturn: GainNode;

    private volumes: Volumes = { 
        melody: { gain: 6, reverbSend: -24, distortion: 0 },
        manualBass: { gain: 6, reverbSend: -48, distortion: 0 },
        latch: { gain: -15, reverbSend: -48, distortion: 0 },
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
    
    private activePointers = new Map<number, { type: 'melody' | 'bass' }>();

    private _isPlaying = false;
    private animationFrameId: number | null = null;

    constructor(context: AudioContext, orbManager: OrbManager) {
        this.context = context;
        this.orbManager = orbManager;
        
        // Final output node
        this.masterOut = this.context.createGain();
        this.masterOut.connect(this.context.destination);
        
        // Pre-compressor bus
        this.preCompressorOut = this.context.createGain();

        // Compressor setup
        this.compressor = this.context.createDynamicsCompressor();
        this.preCompressorOut.connect(this.compressor);
        this.compressor.connect(this.masterOut);

        // Reverb return connects pre-compressor
        this.reverbReturn = this.context.createGain();
        this.reverbReturn.connect(this.preCompressorOut);
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

    public async initialize() {
        if (this.isInitialized) return;

        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
        console.log("AudioContext is active.");
        
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
             await this.context.audioWorklet.addModule('/worklets/theremin-processor.js');
             await this.context.audioWorklet.addModule('/worklets/latch-processor.js');
             await this.context.audioWorklet.addModule('/worklets/drum-processor.js');
             await this.context.audioWorklet.addModule('/worklets/reverb-processor.js');
             await this.context.audioWorklet.addModule('/worklets/distortion-processor.js');
             console.log('AudioWorklet modules loaded.');
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        const reverbBus = new AudioWorkletNode(this.context, 'reverb-processor');
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
        if (!this.context) return;
    
        // Main output gain for this part
        const gainNode = this.context.createGain();
        gainNode.connect(this.preCompressorOut);

        // Distortion chain
        const distortionWorkletNode = new AudioWorkletNode(this.context, 'distortion-processor', {
            outputChannelCount: [1],
        });
        const distortionSendGain = this.context.createGain();
        const distortionWetGain = this.context.createGain();
        const distortionDryGain = this.context.createGain();
        
        distortionSendGain.connect(distortionWorkletNode);
        distortionWorkletNode.connect(distortionWetGain);
        distortionWetGain.connect(gainNode);
        distortionDryGain.connect(gainNode);


        // Reverb send
        const reverbSendNode = this.context.createGain();
        reverbSendNode.connect(reverbBus);
    
        // The main synth worklet
        const workletNode = new AudioWorkletNode(this.context, processorName, {
            processorOptions: { sampleRate: this.context.sampleRate, polyphony },
            outputChannelCount: [1]
        });
    
        // Routing: Worklet -> Dry/Wet (for distortion) -> Main Gain -> Reverb Send
        workletNode.connect(distortionSendGain);
        workletNode.connect(distortionDryGain);
        workletNode.connect(reverbSendNode);

        // Store all nodes
        this.nodes.set(part, {
            worklet: workletNode,
            gain: gainNode,
            reverbSend: reverbSendNode,
            distortionSend: distortionWetGain, // This is now the 'wet' gain after the processor
            distortionDry: distortionDryGain, // And this is the 'dry'
            distortionProcessor: distortionWorkletNode, // The actual processor
        } as any);
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
        if (preset && this.nodes.get('melody')) {
            this.nodes.get('melody')?.worklet.port.postMessage({ type: 'setPreset', preset: preset.params });
            const newVolumes = {...this.volumes};
            newVolumes.melody.distortion = preset.params.distortion ?? 0;
            this.setVolumes(newVolumes);
        }
    }
    
    public setBassInstrument(instrumentName: BassInstrument) {
        const preset = bassInstruments.find(p => p.id === instrumentName);
        if (preset) {
            const newVolumes = {...this.volumes};
            const distortion = preset.params.distortion ?? 0;

            const manualBassNode = this.nodes.get('manualBass');
            if(manualBassNode) {
                manualBassNode.worklet.port.postMessage({ type: 'setPreset', preset: preset.params });
                newVolumes.manualBass.distortion = distortion;
            }

            const latchNode = this.nodes.get('latch');
            if (latchNode) {
                latchNode.worklet.port.postMessage({ type: 'setPreset', preset: preset.params });
                newVolumes.latch.distortion = distortion;
            }
            this.setVolumes(newVolumes);
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

        (Object.keys(newVolumes) as Array<keyof Volumes>).forEach((key) => {
            const part = key as PartName | 'compressor' | 'reverbReturn';

            if (part === 'compressor') {
                const settings = newVolumes.compressor;
                this.compressor.threshold.linearRampToValueAtTime(settings.threshold, rampTime);
                this.compressor.ratio.linearRampToValueAtTime(settings.ratio, rampTime);
                this.compressor.attack.linearRampToValueAtTime(settings.attack, rampTime);
                this.compressor.release.linearRampToValueAtTime(settings.release, rampTime);

                if (settings.enabled) {
                    this.preCompressorOut.disconnect();
                    this.preCompressorOut.connect(this.compressor);
                } else {
                    this.preCompressorOut.disconnect();
                    this.preCompressorOut.connect(this.masterOut);
                }
            } else if (part === 'reverbReturn') {
                this.reverbReturn.gain.linearRampToValueAtTime(dbToGain(newVolumes.reverbReturn), rampTime);
            } else {
                 const nodeInfo = this.nodes.get(part);
                 if (nodeInfo) {
                    const channelVols = newVolumes[part];
                    const gainValue = dbToGain(channelVols.gain);
                    nodeInfo.gain.gain.linearRampToValueAtTime(gainValue, rampTime);
                    
                    const reverbSendValue = dbToGain(channelVols.reverbSend);
                    nodeInfo.reverbSend.gain.linearRampToValueAtTime(reverbSendValue, rampTime);
                    
                    const driveParam = (nodeInfo as any).distortionProcessor?.parameters.get('drive');
                    if (driveParam) {
                        const driveValue = 1.0 + (channelVols.distortion / 100) * 99;
                        driveParam.linearRampToValueAtTime(driveValue, rampTime);
                    }
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
