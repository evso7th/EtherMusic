

"use client";

import * as Tone from 'tone';
import { Orb } from '@/app/page';

const NOTE_PROXIMITY_THRESHOLD = 35;

type LatchedNoteSynth = {
    synth: Tone.Synth;
    gain: Tone.Gain;
};

type LatchedBassNote = {
    id: number;
    x: number;
    y: number;
    synthNode: LatchedNoteSynth;
    initialFreq: number;
    volume: number; // Volume from 0.0 to 1.0
};

export class LatchEngine {
    private isLatchOn = false;
    
    private synthPool: LatchedNoteSynth[] = [];
    private latchedNotes = new Map<number, LatchedBassNote>();
    private readonly destination: Tone.ToneAudioNode;

    constructor(destination: Tone.ToneAudioNode) {
        this.destination = destination;
        this.initialize();
    }

    private initialize() {
        const synthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 0.8 },
        } as const;

        for (let i = 0; i < 2; i++) {
            const gain = new Tone.Gain(1).connect(this.destination);
            const synth = new Tone.Synth(synthOptions).connect(gain);
            this.synthPool.push({ synth, gain });
        }
    }
    
    public setLatch(isOn: boolean) {
        this.isLatchOn = isOn;
        if (!isOn && this.latchedNotes.size > 0) {
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
            const freeSynthNode = this.synthPool.find(node => 
                !Array.from(this.latchedNotes.values()).some(n => n.synthNode === node)
            );

            if (freeSynthNode) {
                const newId = Date.now() + Math.random();
                const newNote: LatchedBassNote = {
                    id: newId, x: pos.x, y: pos.y,
                    initialFreq: quantizedFreq, 
                    volume: vol, // Use the passed-in volume
                    synthNode: freeSynthNode,
                };
                this.latchedNotes.set(newId, newNote);
                this.playNote(newNote);
            }
        }
        this.dispatchOrbs();
    }

    private playNote(note: LatchedBassNote) {
        // Set initial volume based on the note's own volume property.
        note.synthNode.gain.gain.value = note.volume;
        note.synthNode.synth.triggerAttack(note.initialFreq);
    }
    
    public startAll() {
        this.latchedNotes.forEach(this.playNote.bind(this));
    }
    
    public pauseAll() {
        this.latchedNotes.forEach((note) => {
            note.synthNode.synth.triggerRelease();
        });
    }

    public stopAll() {
        this.latchedNotes.forEach((note, id) => {
            this.releaseAndRemoveNote(id);
        });
        this.dispatchOrbs(); 
    }

    private releaseAndRemoveNote(noteId: number) {
        const noteToRelease = this.latchedNotes.get(noteId);
        if(noteToRelease) {
            noteToRelease.synthNode.synth.triggerRelease();
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

