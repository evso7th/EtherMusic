
import type { Volumes } from '@/types';
import { OrbManager } from './orb-manager';

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

    public masterOut: GainNode;
    private nodes = new Map<PartName, { worklet: AudioWorkletNode, gain: GainNode }>();
    private volumes: Volumes = { 
        melody: -6, 
        manualBass: -6, 
        latch: -15, 
        drums: -9
    };
    private isBassLatchOn: boolean = false;
    
    private activePointers = new Map<number, { type: 'melody' | 'bass', part: PartName }>();

    private _isPlaying = false;
    private animationFrameId: number | null = null;

    constructor(context: AudioContext, orbManager: OrbManager) {
        this.context = context;
        this.orbManager = orbManager;
        this.masterOut = this.context.createGain();
        this.masterOut.connect(this.context.destination);
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
        this.setTempo(90);
        
        this.isInitialized = true;
        console.log('AudioEngine initialized with native Web Audio API nodes.');
    }
    
    private createWorkletNode(part: PartName, processorName: string) {
        if (!this.context || !this.masterOut) return;
        
        const gainNode = this.context.createGain();
        gainNode.connect(this.masterOut);

        const workletNode = new AudioWorkletNode(this.context, processorName, {
            processorOptions: {
                sampleRate: this.context.sampleRate,
                polyphony: (part === 'melody' || part === 'manualBass' || part === 'latch') ? 4 : 8
            },
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1]
        });
        workletNode.connect(gainNode);

        this.nodes.set(part, { worklet: workletNode, gain: gainNode });
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

    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, padInfo: { x: number, y: number }) {
        if (!this.isInitialized || !this.context) return;
        
        const partName = type === 'bass' && this.isBassLatchOn ? 'latch' : (type === 'bass' ? 'manualBass' : type);
        const node = this.nodes.get(partName)?.worklet;

        if (!node) return;
        
        this.activePointers.set(pointerId, { type, part: partName });
        
        node.port.postMessage({
            type: 'noteOn',
            note: {
                id: pointerId,
                frequency: freq,
                volume: vol,
                time: this.context.currentTime
            }
        });
        
        const orbType = this.isBassLatchOn && type === 'bass' ? 'latch' : type;
        this.orbManager?.addOrb(pointerId, orbType, padInfo.x, padInfo.y);
    }

    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, padInfo: { x: number, y: number }) {
        if (!this.isInitialized || !this.context) return;
        
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
        this.nodes.get('drums')?.worklet.port.postMessage({type: 'setTempo', bpm});
    }
    
    public setVolumes(newVolumes: Volumes) {
        if (!this.isInitialized || !this.context || !this.masterOut) return;
        this.volumes = newVolumes;
        const rampTime = this.context.currentTime + 0.05;

        Object.entries(newVolumes).forEach(([part, db]) => {
            const nodeInfo = this.nodes.get(part as PartName);
            const gainValue = dbToGain(db);
            if (nodeInfo) {
                nodeInfo.gain.gain.linearRampToValueAtTime(gainValue, rampTime);
            }
        });
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
