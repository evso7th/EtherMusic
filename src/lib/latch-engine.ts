

"use client";

import type { AudioEngine } from './audio-engine';
import type { OrbManager } from './orb-manager';

const NOTE_PROXIMITY_THRESHOLD = 35;
const MAX_LATCHED_NOTES = 4;

type LatchedBassNote = {
    id: number;
    x: number;
    y: number;
    voice: any; // Will hold the Voice object from AudioEngine
    initialFreq: number;
    volume: number;
};

export class LatchEngine {
    private isLatchOn = false;
    private audioEngine: AudioEngine;
    private orbManager: OrbManager;
    private latchedNotes = new Map<number, LatchedBassNote>();
    private allowedFrequencies: number[] = [];

    constructor(audioEngine: AudioEngine, orbManager: OrbManager) {
        this.audioEngine = audioEngine;
        this.orbManager = orbManager;
    }
    
    public setAllowedFrequencies(frequencies: number[]) {
        this.allowedFrequencies = frequencies;
    }
    
    public setLatch(isOn: boolean) {
        const wasOn = this.isLatchOn;
        this.isLatchOn = isOn;
        
        if (wasOn && !isOn) {
            this.stopAll();
        }
    }
    
    public handleInteraction(pos: { x: number; y: number }, vol: number, freq: number) {
        if (!this.isLatchOn) return;

        const quantizedFreq = this.getClosestFrequency(freq);

        // Check if there is an existing note nearby to remove
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
            // If we've reached the limit, remove the oldest note
            if (this.latchedNotes.size >= MAX_LATCHED_NOTES) {
                const oldestNoteId = this.latchedNotes.keys().next().value;
                this.releaseAndRemoveNote(oldestNoteId);
            }

            // Get a voice from the main engine
            const voice = this.audioEngine.getLatchVoice(quantizedFreq, vol);
            if (voice) {
                const newId = Date.now() + Math.random();
                const newNote: LatchedBassNote = {
                    id: newId, x: pos.x, y: pos.y,
                    initialFreq: quantizedFreq, 
                    volume: vol,
                    voice: voice,
                };
                this.latchedNotes.set(newId, newNote);
                this.orbManager.addOrb(newId, 'latch', pos.x, pos.y);
            }
        }
    }

    private getClosestFrequency(targetFreq: number): number {
        if (this.allowedFrequencies.length === 0) return targetFreq;
        return this.allowedFrequencies.reduce((prev, curr) => (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev));
    }

    public startAll() {
        this.latchedNotes.forEach(note => {
            if (note.voice && note.voice.isAvailable()) {
                note.voice.attack(note.initialFreq, note.volume, null, 'latch');
            }
        });
    }
    
    public pauseAll() {
        this.latchedNotes.forEach((note) => {
            this.audioEngine.releaseLatchVoice(note.voice);
        });
    }

    public stopAll() {
        this.latchedNotes.forEach((note, id) => {
            this.releaseAndRemoveNote(id);
        });
    }

    private releaseAndRemoveNote(noteId: number) {
        const noteToRelease = this.latchedNotes.get(noteId);
        if(noteToRelease && noteToRelease.voice) {
            this.audioEngine.releaseLatchVoice(noteToRelease.voice);
            this.latchedNotes.delete(noteId);
            this.orbManager.removeOrb(noteId);
        }
    }
}

    
