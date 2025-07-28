
"use client";

import * as Tone from 'tone';
import { Orb } from '@/app/page';

const NOTE_PROXIMITY_THRESHOLD = 35;

type LatchedNoteSynth = {
    synth: Tone.Synth;
    lfo: Tone.LFO;
    volumeControl: Tone.Multiply;
};

type LatchedBassNote = {
    id: number;
    x: number;
    y: number;
    synthNode: LatchedNoteSynth;
    initialFreq: number;
    volume: number;
};

export class LatchEngine {
    private isLatchOn = false;
    private isPulsating = false;
    
    private synthPool: LatchedNoteSynth[] = [];
    private latchedNotes = new Map<number, LatchedBassNote>();
    private baseVolumeDb = -6;
    private readonly destination: Tone.ToneAudioNode;

    constructor(destination: Tone.ToneAudioNode) {
        this.destination = destination;
        this.initialize();
    }

    private initialize() {
        const synthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 0.8 },
        } as const;

        for (let i = 0; i < 2; i++) {
            const synth = new Tone.Synth(synthOptions);
            const lfo = new Tone.LFO({
                type: "sine",
                min: 0.2,
                max: 1,
                frequency: "4n",
            }).start();
            
            const volumeControl = new Tone.Multiply(Tone.dbToGain(this.baseVolumeDb)).connect(this.destination);
            synth.connect(volumeControl);

            this.synthPool.push({ synth, lfo, volumeControl });
        }
    }
    
    public setVolume(db: number) {
        this.baseVolumeDb = db;
        const gain = Tone.dbToGain(db);
        this.synthPool.forEach(node => {
             node.volumeControl.factor.rampTo(gain, 0.1);
        });
    }

    public setLatch(isOn: boolean) {
        this.isLatchOn = isOn;
        if (!isOn && this.latchedNotes.size > 0) {
            this.stopAll();
        }
    }

    public setPulsating(isPulsating: boolean) {
        this.isPulsating = isPulsating;
        this.latchedNotes.forEach(note => {
            this.updatePulsationForNote(note);
        });
    }

    private updatePulsationForNote(note: LatchedBassNote) {
        const { lfo, volumeControl } = note.synthNode;
        const baseGain = Tone.dbToGain(this.baseVolumeDb);
        
        if (this.isPulsating) {
            lfo.connect(volumeControl.factor);
        } else {
            lfo.disconnect(volumeControl.factor);
            volumeControl.factor.rampTo(baseGain, 0.1);
        }
    }
    
    public stopAll() {
        this.latchedNotes.forEach((note, id) => {
            this.releaseAndRemoveNote(id);
        });
        this.dispatchOrbs(); 
    }

    public handleInteraction(pos: { x: number; y: number }, vol: number, quantizedFreq: number) {
        if (!this.isLatchOn) return;

        let existingEntryId;
        for (const [id, note] of this.latchedNotes.entries()) {
            const distance = Math.sqrt(Math.pow(note.x - pos.x, 2) + Math.pow(note.y - pos.y, 2));
            if (distance < NOTE_PROXIMITY_THRESHOLD) {
                existingEntryId = id;
                break;
            }
        }

        if (existingEntryId !== undefined) {
            this.releaseAndRemoveNote(existingEntryId);
        } else {
            const freeSynthNode = this.synthPool.find(node => 
                !Array.from(this.latchedNotes.values()).some(n => n.synthNode === node)
            );

            if (freeSynthNode) {
                const newId = Date.now() + Math.random();
                const newNote: LatchedBassNote = {
                    id: newId, x: pos.x, y: pos.y,
                    initialFreq: quantizedFreq, volume: vol,
                    synthNode: freeSynthNode,
                };
                this.latchedNotes.set(newId, newNote);
                this.playNote(newNote);
            }
        }
        this.dispatchOrbs();
    }
    
    private playNote(note: LatchedBassNote) {
        note.synthNode.synth.triggerAttack(note.initialFreq, undefined, note.volume);
        this.updatePulsationForNote(note);
    }
    
    private releaseAndRemoveNote(noteId: number) {
        const noteToRelease = this.latchedNotes.get(noteId);
        if(noteToRelease) {
            const { synth, lfo, volumeControl } = noteToRelease.synthNode;
            lfo.disconnect(volumeControl.factor);
            synth.triggerRelease();
            this.latchedNotes.delete(noteId);
        }
    }

    private dispatchOrbs() {
        const latchedOrbs: Orb[] = Array.from(this.latchedNotes.values()).map(note => ({
            id: note.id,
            x: note.x,
            y: note.y,
            type: 'latch' as const,
        }));
        document.dispatchEvent(new CustomEvent('latch-orbs-updated', { detail: latchedOrbs }));
    }
}
