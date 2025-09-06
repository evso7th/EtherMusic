
import type { Volumes, Note } from '@/types';
import { OrbManager } from './orb-manager';
import { LatchEngine, type LatchToggleResult } from './latch-engine';


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
    private latchEngine = new LatchEngine();
    
    private activePointers = new Map<number, { type: 'melody' | 'bass' }>();

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
             await this.context.audioWorklet.addModule('/worklets/latch-processor.js');
             await this.context.audioWorklet.addModule('/worklets/drum-processor.js');
             console.log('AudioWorklet modules loaded.');
        } catch (e) {
            console.error("Failed to add AudioWorklet module", e);
            throw new Error("Could not load core audio components. Please try refreshing the page.");
        }
        
        this.createWorkletNode('melody', 'theremin-processor', 4);
        this.createWorkletNode('manualBass', 'theremin-processor', 4);
        this.createWorkletNode('latch', 'latch-processor', 4);
        this.createWorkletNode('drums', 'drum-processor', 8);

        this.setVolumes(this.volumes);
        this.setTempo(90);
        
        this.isInitialized = true;
        console.log('AudioEngine initialized with native Web Audio API nodes.');
    }
    
    private createWorkletNode(part: PartName, processorName: string, polyphony: number) {
        if (!this.context || !this.masterOut) return;
        
        const gainNode = this.context.createGain();
        gainNode.connect(this.masterOut);

        const workletNode = new AudioWorkletNode(this.context, processorName, {
            processorOptions: {
                sampleRate: this.context.sampleRate,
                polyphony,
            },
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

    private positionToId(x: number, y: number): number {
        const roundedX = Math.round(x / 10);
        const roundedY = Math.round(y / 10);
        return roundedX * 1000 + roundedY;
    }

    public handleThereminInteraction(type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') {
        if (!this.isInitialized || !this.context || !data) return;

        if (type === 'bass' && this.isBassLatchOn) {
            if (state === 'down') {
                const id = this.positionToId(data.x, data.y);
                const result = this.latchEngine.toggleNote(id, data.frequency, data.volume);
                this.processLatchResult(result);
            }
            // In latch mode, we don't process 'move' or 'up' for bass.
            return;
        }

        const partName = type === 'bass' ? 'manualBass' : type;
        const node = this.nodes.get(partName)?.worklet;
        if (!node) return;

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
            this.orbManager.removeOrb(result.noteOff.id);
        }

        if (result.noteOn) {
            latchNode.port.postMessage({ type: 'noteOn', note: result.noteOn });
            // We need a way to get the pad position to the orb manager.
            // LatchEngine doesn't know about x/y. Let's assume OrbManager handles it.
            // A better way would be to pass padInfo into LatchEngine or handle orb creation outside.
            // For now, let's let OrbManager handle it, assuming it got the info.
        }

        if (result.noteToAnimate) {
            const padEl = document.getElementById('theremin-pad-bass');
            if(padEl) {
                const rect = padEl.getBoundingClientRect();
                const x = (Math.floor(result.noteToAnimate.id / 1000) * 10)
                const y = ((result.noteToAnimate.id % 1000) * 10)
                if (result.noteToAnimate.type === 'add') {
                    this.orbManager.addOrb(result.noteToAnimate.id, 'latch', x, y);
                } else {
                    this.orbManager.removeOrb(result.noteToAnimate.id);
                }
            }
        }
    }
    
    public setBassLatch(isOn: boolean) {
        this.isBassLatchOn = isOn;
        if (!isOn) {
            const notesToTurnOff = this.latchEngine.clear();
            const latchNode = this.nodes.get('latch')?.worklet;
            if (latchNode) {
                latchNode.port.postMessage({ type: 'allNotesOff' });
                notesToTurnOff.forEach(note => this.orbManager.removeOrb(note.id));
            }
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
        this.latchEngine.clear();
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
