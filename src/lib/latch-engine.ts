
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

    constructor(destination: Tone.ToneAudioNode) {
        this.initialize(destination);
    }

    private initialize(destination: Tone.ToneAudioNode) {
        this.gainNode = new Tone.Gain(1).connect(destination);

        this.lfo = new Tone.LFO({
            type: "sine",
            frequency: "2n",
            min: -24,
            max: 0,
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
        this.lfo.frequency.value = Tone.Time("2n").toFrequency();
    }
    
    public setVolume(db: number) {
         this.gainNode.gain.rampTo(Tone.dbToGain(db), 0.1);
    }

    public setLatch(isOn: boolean) {
        this.isLatchOn = isOn;
        if (!isOn && this.latchedNotes.size > 0) {
            this.latchedNotes.forEach(note => note.synth.triggerRelease());
            this.latchedNotes.clear();
            this.dispatchOrbs();
        }
    }

    public setPulsating(isPulsating: boolean, isTransportPlaying: boolean) {
        this.isPulsating = isPulsating;
        this.isPlaying = isTransportPlaying;

        if (this.isPulsating && this.isPlaying) {
            this.lfo.connect(this.gainNode.gain);
        } else {
            this.lfo.disconnect(this.gainNode.gain);
            // Ensure gain returns to the set volume, not just 1
            this.gainNode.gain.rampTo(this.gainNode.gain.value, 0.2); 
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
                const velocity = vol * vol;
                
                if (this.isPlaying) {
                    assignedSynth.triggerAttack(quantizedFreq, undefined, velocity);
                }

                this.latchedNotes.set(newId, {
                    id: newId, x: pos.x, y: pos.y,
                    initialFreq: quantizedFreq, volume: velocity,
                    synth: assignedSynth,
                });
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

    public stopAll() {
        this.isPlaying = false;
        this.latchedNotes.forEach(note => note.synth.triggerRelease());
        if(this.isPulsating) {
            this.lfo.disconnect(this.gainNode.gain);
        }
        // Do not clear notes on stop, but update orbs to show they are "off"
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
