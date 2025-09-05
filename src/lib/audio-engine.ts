
import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';
import { DrumMachine } from './drum-machine';
import type { OrbManager } from './orb-manager';
import type { NoteEvent, WorkerAutopilotPart, NoteUpdateEvent } from './autopilot-worker';

// This new AudioEngine will be much simpler.
// Its primary job is to manage the AudioContext, load the worklets,
// and route messages to them.

export class AudioEngine {
    public isInitialized = false;
    private context!: Tone.Context;
    public orbManager!: OrbManager;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];

    // Nodes for our new architecture
    private thereminNode!: AudioWorkletNode;
    private bassNode!: AudioWorkletNode;
    private drumNode!: AudioWorkletNode;
    private masterChannel!: Tone.Channel;
    private fx!: { reverb: Tone.Reverb, delay: Tone.FeedbackDelay };

    constructor() {
        // Initialization is deferred to an async method
    }

    public async initialize() {
        if (this.isInitialized) return;

        await Tone.start();
        this.context = Tone.getContext();
        
        // Create a master channel for effects
        this.masterChannel = new Tone.Channel(-6).toDestination();
        this.fx = {
            reverb: new Tone.Reverb({ decay: 4, wet: 0.5 }),
            delay: new Tone.FeedbackDelay("8n", 0.25)
        };
        this.masterChannel.chain(this.fx.reverb, this.fx.delay, Tone.Destination);

        console.log('AudioContext started. Loading worklets...');

        try {
            await this.context.audioWorklet.addModule('/worklets/theremin-processor.js');
            await this.context.audioWorklet.addModule('/worklets/drum-processor.js');
            
            this.thereminNode = new AudioWorkletNode(this.context.rawContext, 'theremin-processor');
            this.bassNode = new AudioWorkletNode(this.context.rawContext, 'theremin-processor'); // Can reuse the same processor
            this.drumNode = new AudioWorkletNode(this.context.rawContext, 'drum-processor');

            this.thereminNode.connect(this.masterChannel);
            this.bassNode.connect(this.masterChannel);
            this.drumNode.connect(this.masterChannel);

            console.log('Worklets loaded and connected.');

        } catch (e) {
            console.error("Error loading AudioWorklets:", e);
            // Here you could inform the user that their browser might not support AudioWorklets
            alert("Failed to load audio engine. Your browser might not support the necessary Web Audio features.");
            return;
        }

        Tone.Transport.set({ bpm: 90, swing: 0, timeSignature: 4 });
        this.isInitialized = true;
        console.log('AudioEngine initialized with Worklets.');
    }
    
    // --- Simplified Control Methods ---

    public setOrbManager(orbManager: OrbManager) {
        this.orbManager = orbManager;
    }
    
    // --- Theremin Pad Interaction ---
    public startNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const node = type === 'melody' ? this.thereminNode : this.bassNode;
        node.port.postMessage({ type: 'noteOn', frequency: freq, volume: vol, pointerId });
        this.orbManager?.addOrb(pointerId, type, pos.x, pos.y);
    }
    
    public updateNote(type: 'melody' | 'bass', pointerId: number, freq: number, vol: number, pos: {x: number, y: number}) {
        const node = type === 'melody' ? this.thereminNode : this.bassNode;
        node.port.postMessage({ type: 'noteUpdate', frequency: freq, volume: vol, pointerId });
        this.orbManager?.updateOrb(pointerId, pos.x, pos.y);
    }
    
    public stopNote(type: 'melody' | 'bass', pointerId: number) {
        const node = type === 'melody' ? this.thereminNode : this.bassNode;
        node.port.postMessage({ type: 'noteOff', pointerId });
        this.orbManager?.removeOrb(pointerId);
    }

    public setHarmony(key: MusicKey, scale: MusicScale) {
        // The harmonization logic will now live inside the worklet.
        // We just need to send the new settings.
        const message = { type: 'setHarmony', key, scale };
        this.thereminNode.port.postMessage(message);
        this.bassNode.port.postMessage(message);
        // We'll need to send this to the autopilot worker too.
    }

    // --- Drum Machine ---
    public setBeatPattern(patternName: string) {
        this.drumNode.port.postMessage({ type: 'setPattern', patternName });
    }

    // --- Autopilot ---
    public playWorkerNote(note: NoteEvent) {
        // This will need a new Autopilot worklet node.
        // For now, we'll leave this blank.
        console.log("Received note from Autopilot worker:", note);
    }

    public playWorkerNotesBatch(notes: NoteEvent[]) {
        // This will also be handled by a new worklet.
         notes.forEach(note => this.playWorkerNote(note));
    }
    
    public updateWorkerNote(note: NoteUpdateEvent) {
        // To be implemented with autopilot worklet
    }


    // --- Global Controls ---
    public setTempo(bpm: number) {
        if (this.isInitialized) {
            Tone.Transport.bpm.value = bpm;
            // We might also need to inform the worklets if they have time-sensitive calculations
            this.drumNode.port.postMessage({ type: 'setTempo', bpm });
        }
    }
    
    public setVolumes(volumes: Record<string, number>) {
        if (!this.isInitialized) return;
        // This part can remain similar, controlling the output channels.
        // We'll need to adjust the channel setup.
        this.masterChannel.volume.value = volumes.melody; // Example, needs refinement
    }

    public setEffects(effects: Record<string, any>) {
        if (!this.isInitialized) return;
        this.fx.reverb.wet.value = Tone.dbToGain(effects.melody.reverb);
        this.fx.delay.wet.value = Tone.dbToGain(effects.melody.delay);
    }
    
    public setBassLatch(isOn: boolean) {
        this.bassNode.port.postMessage({ type: 'latch', isOn });
    }
    
    public stopAllSounds() {
        this.thereminNode.port.postMessage({ type: 'allNotesOff' });
        this.bassNode.port.postMessage({ type: 'allNotesOff' });
        this.drumNode.port.postMessage({ type: 'stop' });
        this.orbManager?.removeAllOrbs();
    }
    
    // --- Recording (can remain as is for now) ---
    public startRecording() {
        if (!this.isInitialized || this.mediaRecorder?.state === 'recording') return;
        
        const dest = this.context.createMediaStreamDestination();
        Tone.getDestination().connect(dest);
        
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

    