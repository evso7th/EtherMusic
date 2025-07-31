
"use client";

import * as Tone from 'tone';
import type { OrbManager } from './orb-manager';

const NOTE_PROXIMITY_THRESHOLD = 35;

type LatchedBassNote = {
    id: number;
    x: number;
    y: number;
    synth: Tone.Synth;
    initialFreq: number;
    volume: number; // Volume from 0.0 to 1.0
};

export class LatchEngine {
    private isLatchOn = false;
    
    private synthPool: Tone.Synth[];
    private orbManager: OrbManager;
    private latchedNotes = new Map<number, LatchedBassNote>();

    constructor(synthPool: Tone.Synth[], orbManager: OrbManager) {
        this.synthPool = synthPool;
        this.orbManager = orbManager;
    }
    
    public setLatch(isOn: boolean) {
        const wasOn = this.isLatchOn;
        this.isLatchOn = isOn;
        
        if (!wasOn && isOn) {
            // just turned on, nothing to do
        } else if (wasOn && !isOn) {
            // just turned off
            this.stopAll();
        }
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
            const freeSynth = this.synthPool.find(synth => 
                !Array.from(this.latchedNotes.values()).some(n => n.synth === synth)
            );

            if (freeSynth) {
                const newId = Date.now() + Math.random();
                const newNote: LatchedBassNote = {
                    id: newId, x: pos.x, y: pos.y,
                    initialFreq: quantizedFreq, 
                    volume: vol,
                    synth: freeSynth,
                };
                this.latchedNotes.set(newId, newNote);
                this.playNote(newNote);
                this.orbManager.addOrb(newId, 'latch', pos.x, pos.y);
            }
        }
    }

    private playNote(note: LatchedBassNote) {
        note.synth.triggerAttack(note.initialFreq, undefined, note.volume);
    }
    
    public startAll() {
        this.latchedNotes.forEach(this.playNote.bind(this));
    }
    
    public pauseAll() {
        this.latchedNotes.forEach((note) => {
            note.synth.triggerRelease();
        });
    }

    public stopAll() {
        this.latchedNotes.forEach((note, id) => {
            this.releaseAndRemoveNote(id);
        });
    }

    private releaseAndRemoveNote(noteId: number) {
        const noteToRelease = this.latchedNotes.get(noteId);
        if(noteToRelease) {
            noteToRelease.synth.triggerRelease();
            this.latchedNotes.delete(noteId);
            this.orbManager.removeOrb(noteId);
        }
    }
}
