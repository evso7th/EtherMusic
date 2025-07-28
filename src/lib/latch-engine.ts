
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
    isPlaying: boolean;
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
            const synth = new Tone.Synth(synthOptions);
            const gain = new Tone.Gain(Tone.dbToGain(this.baseVolumeDb)).connect(this.destination);
            synth.connect(gain);
            
            const lfo = new Tone.LFO({
                type: "sine",
                min: 0.2,
                max: 1,
                frequency: "4n",
            });
            lfo.connect(gain.gain);

            this.synthPool.push({ synth, lfo, gain });
        }
    }
    
    public setVolume(db: number) {
        this.baseVolumeDb = db;
        const gainValue = Tone.dbToGain(db);
        this.latchedNotes.forEach(note => {
             note.synthNode.gain.gain.value = gainValue;
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
        const { lfo, gain } = note.synthNode;
        const baseGain = Tone.dbToGain(this.baseVolumeDb);
        
        if (this.isPulsating) {
            if (lfo.state !== 'started') {
                 lfo.start();
            }
        } else {
             if (lfo.state === 'started') {
                lfo.stop();
            }
            gain.gain.rampTo(baseGain, 0.1);
        }
    }
    
    public startAll() {
        this.latchedNotes.forEach(note => {
            if(!note.isPlaying) {
                this.playNote(note);
            }
        });
    }
    
    public pauseAll() {
         this.latchedNotes.forEach(note => {
            if(note.isPlaying) {
                this.pauseNote(note);
            }
        });
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
                    isPlaying: false
                };
                this.latchedNotes.set(newId, newNote);
                this.playNote(newNote);
            }
        }
        this.dispatchOrbs();
    }
    
    private playNote(note: LatchedBassNote) {
        if (note.isPlaying) return;
        note.synthNode.synth.triggerAttack(note.initialFreq, undefined, note.volume);
        this.updatePulsationForNote(note);
        note.isPlaying = true;
    }
    
     private pauseNote(note: LatchedBassNote) {
        if (!note.isPlaying) return;
        note.synthNode.synth.triggerRelease();
        if (note.synthNode.lfo.state === 'started') {
            note.synthNode.lfo.stop();
        }
        note.isPlaying = false;
    }

    private releaseAndRemoveNote(noteId: number) {
        const noteToRelease = this.latchedNotes.get(noteId);
        if(noteToRelease) {
            this.pauseNote(noteToRelease);
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
