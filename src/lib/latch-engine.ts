
"use client";

import * as Tone from 'tone';
import { Orb } from '@/app/page';

const NOTE_PROXIMITY_THRESHOLD = 35;

type LatchedNoteSynth = {
    synth: Tone.Synth;
    gain: Tone.Gain;
    lfo: Tone.LFO;
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
                frequency: "2n",
                min: 0.2,
                max: 1,
            }).start();
            
            const synth = new Tone.Synth(synthOptions).connect(gain);
            this.synthPool.push({ synth, gain, lfo });
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
        const { gain, lfo } = note.synthNode;
        // Only pulsate if the main transport is running
        const shouldPulsate = this.isPulsating && Tone.Transport.state === 'started';

        if (shouldPulsate) {
            if (!lfo.isCelled(gain.gain)) {
                 lfo.connect(gain.gain);
            }
        } else {
            if (lfo.isCelled(gain.gain)) {
                lfo.disconnect(gain.gain);
            }
            // Return to base volume
            gain.gain.rampTo(Tone.dbToGain(this.baseVolumeDb), 0.1);
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
            if(noteToRelease) {
                this.releaseNote(noteToRelease);
                this.latchedNotes.delete(existingEntryId);
            }
        } else {
            const freeSynthNode = this.synthPool.find(node => 
                !Array.from(this.latchedNotes.values()).some(n => n.synthNode === node)
            );

            if (freeSynthNode) {
                const newId = Date.now();
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
        note.synthNode.synth.triggerAttack(note.initialFreq, undefined, note.volume);
        this.updatePulsationForNote(note);
    }
    
    private releaseNote(note: LatchedBassNote) {
        const { synth, lfo, gain } = note.synthNode;
        if (lfo.isCelled(gain.gain)) {
            lfo.disconnect(gain.gain);
        }
        synth.triggerRelease();
    }

    // Called when main transport starts
    public startAll() {
        this.latchedNotes.forEach(note => this.updatePulsationForNote(note));
    }
    
    // Called when main transport pauses
    public pauseAll() {
        this.latchedNotes.forEach(note => this.updatePulsationForNote(note));
    }

    // Called on main Stop button or when latch is turned off
    public stopAll(clearNotes = false) {
        this.latchedNotes.forEach(note => {
            this.releaseNote(note);
        });
        if (clearNotes) {
            this.latchedNotes.clear();
        }
        this.dispatchOrbs(); 
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
