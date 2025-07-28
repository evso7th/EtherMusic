
"use client";

import * as Tone from 'tone';
import { Orb } from '@/app/page';

const NOTE_PROXIMITY_THRESHOLD = 35;

type LatchedNoteSynth = {
    synth: Tone.Synth;
    gain: Tone.Gain;
    lfo: Tone.LFO;
    isConnected: boolean; // Track LFO connection state
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

    constructor(destination: Tone.ToneAudioNode) {
        this.initialize(destination);
    }

    private initialize(destination: Tone.ToneAudioNode) {
        const synthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 0.8 },
        } as const;

        for (let i = 0; i < 2; i++) {
            const gain = new Tone.Gain(1).connect(destination);
            const lfo = new Tone.LFO({
                type: "sine",
                min: 0.2,
                max: 1,
                frequency: "2n",
            });
            
            const synth = new Tone.Synth(synthOptions).connect(gain);
            this.synthPool.push({ synth, gain, lfo, isConnected: false });
        }
    }
    
    public setVolume(db: number) {
        this.baseVolumeDb = db;
        this.latchedNotes.forEach(note => {
            note.synthNode.gain.gain.rampTo(Tone.dbToGain(this.baseVolumeDb), 0.1);
        });
    }

    public setLatch(isOn: boolean) {
        this.isLatchOn = isOn;
        if (!isOn && this.latchedNotes.size > 0) {
            this.stopAll(true);
        }
    }

    public setPulsating(isPulsating: boolean) {
        this.isPulsating = isPulsating;
        this.latchedNotes.forEach(note => {
            this.updatePulsationForNote(note);
        });
    }

    private updatePulsationForNote(note: LatchedBassNote) {
        const { gain, lfo, isConnected } = note.synthNode;
        const shouldPulsate = this.isPulsating && Tone.Transport.state === 'started';

        if (shouldPulsate) {
            if (!isConnected) {
                lfo.connect(gain.gain);
                lfo.start();
                note.synthNode.isConnected = true;
            }
        } else {
            if (isConnected) {
                lfo.stop();
                lfo.disconnect(gain.gain);
                note.synthNode.isConnected = false;
            }
            gain.gain.rampTo(Tone.dbToGain(this.baseVolumeDb), 0.1);
        }
    }
    
    public startAll() {
        this.latchedNotes.forEach(note => this.updatePulsationForNote(note));
    }
    
    public pauseAll() {
         this.latchedNotes.forEach(note => {
             if (note.synthNode.isConnected) {
                note.synthNode.lfo.stop();
                note.synthNode.lfo.disconnect(note.synthNode.gain.gain);
                note.synthNode.isConnected = false;
                note.synthNode.gain.gain.rampTo(Tone.dbToGain(this.baseVolumeDb), 0.1);
            }
        });
    }

    public stopAll(clearNotes = false) {
        this.latchedNotes.forEach((note, id) => {
            this.releaseAndRemoveNote(id);
        });
        if (clearNotes) {
            this.latchedNotes.clear();
        }
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
                    initialFreq: quantizedFreq, volume: vol * vol,
                    synthNode: freeSynthNode,
                };
                this.latchedNotes.set(newId, newNote);
                this.playNote(newNote);
            }
        }
        this.dispatchOrbs();
    }
    
    private playNote(note: LatchedBassNote) {
        note.synthNode.gain.gain.value = Tone.dbToGain(this.baseVolumeDb);
        note.synthNode.synth.triggerAttack(note.initialFreq, undefined, note.volume);
        this.updatePulsationForNote(note);
    }
    
    private releaseAndRemoveNote(noteId: number) {
        const noteToRelease = this.latchedNotes.get(noteId);
        if(noteToRelease) {
            const { synth, lfo, gain, isConnected } = noteToRelease.synthNode;
            if (isConnected) {
                lfo.stop();
                lfo.disconnect(gain.gain);
                noteToRelease.synthNode.isConnected = false;
            }
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
