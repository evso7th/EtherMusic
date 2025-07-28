
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
    private isPulsating = false;
    
    private synthPool: LatchedNoteSynth[] = [];
    private latchedNotes = new Map<number, LatchedBassNote>();
    private readonly destination: Tone.ToneAudioNode;
    private pulsationPattern!: Tone.Pattern<number | null>;

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
        
        // Heartbeat pattern: thump-thump... pause
        const pattern = [1, 0.7, null, null, 1, 0.7, null, null];
        
        this.pulsationPattern = new Tone.Pattern((time, value) => {
            // No need to check isPulsating here, as the pattern is started/stopped directly
            this.latchedNotes.forEach(note => {
                // Modulate based on the note's individual volume
                const targetVolume = value !== null ? note.volume * value : 0;
                note.synthNode.gain.gain.rampTo(targetVolume, 0.02, time);
            });
        }, pattern, "upDown");

        this.pulsationPattern.interval = "8n";
        
        // Ensure the transport is configured to loop for the pattern to work reliably
        Tone.Transport.loop = true;
        Tone.Transport.loopEnd = '1m';
    }
    
    // This is now for the master channel, not individual notes
    public setVolume(db: number) {
        // This function seems to be unused now that volume is per-note,
        // but we'll leave it in case it's needed for a master control later.
    }

    public setLatch(isOn: boolean) {
        this.isLatchOn = isOn;
        if (!isOn && this.latchedNotes.size > 0) {
            this.stopAll();
        }
    }
    
    public setPulsating(isPulsating: boolean) {
        if (this.isPulsating === isPulsating) return;
        this.isPulsating = isPulsating;
        
        if (this.isPulsating) {
             if (Tone.Transport.state !== 'started') {
                 Tone.Transport.start();
             }
             this.pulsationPattern.start(0);
        } else {
            this.pulsationPattern.stop();
            // Restore all notes to their base volume when pulsation stops
            this.latchedNotes.forEach(note => {
                note.synthNode.gain.gain.rampTo(note.volume, 0.1);
            });
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
        const initialGain = this.isPulsating ? 0 : note.volume;
        note.synthNode.gain.gain.value = initialGain;
        note.synthNode.synth.triggerAttack(note.initialFreq);
    }
    
    public startAll() {
        if (this.isPulsating) {
            this.pulsationPattern.start(0);
        }
        this.latchedNotes.forEach(this.playNote.bind(this));
    }
    
    public pauseAll() {
        this.pulsationPattern.stop();
        this.latchedNotes.forEach((note) => {
            note.synthNode.synth.triggerRelease();
        });
    }

    public stopAll() {
        this.pulsationPattern.stop();
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
