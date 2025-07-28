
"use client";

import * as Tone from 'tone';

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
    isPlaying: boolean;
};

export class LatchEngine {
    private isLatchOn = false;
    private isPulsating = false;
    private isTransportPlaying = false;
    
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
                frequency: "2n", // Sync with transport
                min: 0.2,
                max: 1,
            }).start(); // Start LFO immediately
            
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
        if (this.isPulsating && note.isPlaying) {
            if (!lfo.isCelled(gain.gain)) {
                 lfo.connect(gain.gain);
            }
        } else {
            if (lfo.isCelled(gain.gain)) {
                lfo.disconnect(gain.gain);
            }
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
                    isPlaying: false
                };
                this.latchedNotes.set(newId, newNote);
                
                if (this.isTransportPlaying) {
                   this.playNote(newNote);
                }
            }
        }
        this.dispatchOrbs();
    }
    
    private playNote(note: LatchedBassNote) {
        note.synthNode.synth.triggerAttack(note.initialFreq, undefined, note.volume);
        note.isPlaying = true;
        this.updatePulsationForNote(note);
    }
    
    private releaseNote(note: LatchedBassNote) {
        note.synthNode.synth.triggerRelease();
        note.isPlaying = false;
        this.updatePulsationForNote(note);
    }

    public startAll() {
        this.isTransportPlaying = true;
        if (this.latchedNotes.size === 0) return;
        this.latchedNotes.forEach(note => {
            if(!note.isPlaying) {
                this.playNote(note);
            }
        });
    }
    
    public pauseAll() {
        this.isTransportPlaying = false;
        this.latchedNotes.forEach(note => {
            if(note.isPlaying) {
                this.releaseNote(note);
            }
        });
    }

    public stopAll(clearNotes = false) {
        this.isTransportPlaying = false;
        this.latchedNotes.forEach(note => {
            this.releaseNote(note);
        });
        if (clearNotes) {
            this.latchedNotes.clear();
        }
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
