
"use client";

import * as Tone from 'tone';
import { Orb } from '@/app/page';

const NOTE_PROXIMITY_THRESHOLD = 35;

type LatchedNoteSynth = {
    synth: Tone.Synth;
    lfo: Tone.LFO;
    gain: Tone.Gain;
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
    private baseVolumeDb = -9;
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
            gain.gain.value = Tone.dbToGain(this.baseVolumeDb);
            const synth = new Tone.Synth(synthOptions).connect(gain);
            
            // LFO will be started/stopped manually
            const lfo = new Tone.LFO({
                type: "sine",
                min: 0.2,
                max: 1,
                frequency: Tone.Transport.bpm.value / 60 * 2, // Default to 4n based on initial tempo
            });
            lfo.connect(gain.gain);
            
            this.synthPool.push({ synth, lfo, gain });
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
            this.stopAll();
        }
    }
    
    public setPulsating(isPulsating: boolean) {
        if (this.isPulsating === isPulsating) return;
        this.isPulsating = isPulsating;

        const quarterNoteFrequency = Tone.Transport.bpm.value / 60;

        this.latchedNotes.forEach(note => {
            const { lfo, gain } = note.synthNode;
            lfo.frequency.value = quarterNoteFrequency * 2; // "4n"
            
            if (this.isPulsating) {
                lfo.start();
            } else {
                lfo.stop();
                gain.gain.rampTo(Tone.dbToGain(this.baseVolumeDb), 0.1);
            }
        });
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
        note.synthNode.synth.triggerAttack(note.initialFreq);
        if (this.isPulsating) {
             const quarterNoteFrequency = Tone.Transport.bpm.value / 60;
             note.synthNode.lfo.frequency.value = quarterNoteFrequency * 2;
             note.synthNode.lfo.start();
        }
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
            noteToRelease.synthNode.lfo.stop();
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
