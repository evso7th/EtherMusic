
"use client";

import * as Tone from 'tone';
import type { Orb } from '@/app/page';

const NOTE_PROXIMITY_THRESHOLD = 35;

type LatchedBassNote = {
    id: number;
    x: number;
    y: number;
    synth: Tone.Synth;
    initialFreq: number;
    volume: number;
};

export class LatchEngine {
    private isPlaying = false;
    private isLatchOn = false;
    private isPulsating = false;

    private synths: Tone.Synth[] = [];
    private gainNode!: Tone.Gain;
    private lfo!: Tone.LFO;
    private latchedNotes = new Map<number, LatchedBassNote>();
    private baseVolumeDb = -6; // Default volume

    constructor(destination: Tone.ToneAudioNode) {
        this.initialize(destination);
    }

    private initialize(destination: Tone.ToneAudioNode) {
        this.gainNode = new Tone.Gain().connect(destination);
        this.setVolume(this.baseVolumeDb);

        this.lfo = new Tone.LFO({
            type: "sine",
            frequency: "2n",
            min: 0.2, // Modulate between 20% and 100% of the gain
            max: 1,
        }).start();

        const synthOptions = {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 0.8 },
        } as const;

        for (let i = 0; i < 2; i++) {
            this.synths.push(new Tone.Synth(synthOptions).connect(this.gainNode));
        }
    }

    public setTempo(bpm: number) {
        // Frequency is automatically synced to transport tempo, so no action needed here
        // unless you want to change the subdivision ('2n', '4n', etc.)
    }
    
    public setVolume(db: number) {
        this.baseVolumeDb = db;
        // The gain node's gain is the *target* for the LFO, not the direct value
        this.gainNode.gain.rampTo(Tone.dbToGain(db), 0.1);
    }

    public setLatch(isOn: boolean) {
        this.isLatchOn = isOn;
        if (!isOn && this.latchedNotes.size > 0) {
            this.stopAll(true); // Stop and clear all notes
        }
    }

    public setPulsating(isPulsating: boolean, isTransportPlaying: boolean) {
        this.isPulsating = isPulsating;
        this.isPlaying = isTransportPlaying;

        if (this.isPulsating && this.isPlaying) {
            this.lfo.connect(this.gainNode.gain);
        } else {
            this.lfo.disconnect(this.gainNode.gain);
            // After disconnecting, ensure gain returns to the set base volume
            this.gainNode.gain.rampTo(Tone.dbToGain(this.baseVolumeDb), 0.2); 
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
            const noteToRelease = this.latchedNotes.get(existingEntryId);
            noteToRelease?.synth.triggerRelease();
            this.latchedNotes.delete(existingEntryId);
        } else {
            const activeLatchSynths = new Set(Array.from(this.latchedNotes.values()).map(n => n.synth));
            const assignedSynth = this.synths.find(s => !activeLatchSynths.has(s));

            if (assignedSynth) {
                const newId = Date.now();
                const newNote = {
                    id: newId, x: pos.x, y: pos.y,
                    initialFreq: quantizedFreq, volume: vol * vol,
                    synth: assignedSynth,
                };
                this.latchedNotes.set(newId, newNote);
                
                // If transport is already playing, start the new note immediately.
                if (this.isPlaying) {
                    assignedSynth.triggerAttack(newNote.initialFreq, undefined, newNote.volume);
                }
            }
        }
        this.dispatchOrbs();
    }

    public startAll() {
        this.isPlaying = true;
        this.latchedNotes.forEach(note => {
            note.synth.triggerAttack(note.initialFreq, undefined, note.volume);
        });
        if (this.isPulsating) {
            this.lfo.connect(this.gainNode.gain);
        }
    }
    
    public pauseAll() {
        this.isPlaying = false;
        this.latchedNotes.forEach(note => note.synth.triggerRelease());
        if(this.isPulsating) {
            this.lfo.disconnect(this.gainNode.gain);
        }
    }

    public stopAll(clearNotes = false) {
        this.isPlaying = false;
        this.latchedNotes.forEach(note => note.synth.triggerRelease());
        if(this.isPulsating) {
            this.lfo.disconnect(this.gainNode.gain);
        }
        if (clearNotes) {
            this.latchedNotes.clear();
        }
        // Dispatch orbs to show they are "off" or gone
        this.dispatchOrbs(); 
    }

    private dispatchOrbs() {
        const latchedOrbs = Array.from(this.latchedNotes.values()).map(note => ({
            id: note.id,
            x: note.x,
            y: note.y,
            type: 'latch' as const,
        }));
        document.dispatchEvent(new CustomEvent('latch-orbs-updated', { detail: latchedOrbs }));
    }
}
