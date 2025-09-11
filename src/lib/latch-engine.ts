
"use client";

import type { Note } from '@/types';

const MAX_LATCH_NOTES = 4;
const TAP_RADIUS = 40; 
const TAP_RADIUS_SQUARED = TAP_RADIUS * TAP_RADIUS;

export type LatchToggleResult = {
    action: 'added' | 'removed' | 'none';
    noteOn?: Note;
    noteOff?: Note;
    noteToAnimateAdd?: { id: number; x: number; y: number; };
    noteToAnimateRemove?: { id: number };
};

interface TapData {
    frequency: number;
    volume: number;
    pointerId: number;
    x: number;
    y: number;
}

export class LatchEngine {
    private activeNotes: (Note & { x: number; y: number })[] = [];
    private nextId = 0;

    private findNearbyNoteIndex(x: number, y: number): number {
        return this.activeNotes.findIndex(note => {
            const distSq = (note.x - x) ** 2 + (note.y - y) ** 2;
            return distSq < TAP_RADIUS_SQUARED;
        });
    }

    public toggleNote(tapData: TapData): LatchToggleResult {
        if (!tapData) return { action: 'none' };
        
        const { x, y, frequency, volume } = tapData;
        const existingNoteIndex = this.findNearbyNoteIndex(x, y);

        if (existingNoteIndex > -1) {
            // Note exists, remove it
            const noteToRemove = this.activeNotes.splice(existingNoteIndex, 1)[0];
            return {
                action: 'removed',
                noteOff: noteToRemove,
                noteToAnimateRemove: { id: noteToRemove.id }
            };
        }
        
        // Note doesn't exist, add it
        let noteToTurnOff: Note | undefined;
        let noteToAnimateRemove: { id: number } | undefined;

        if (this.activeNotes.length >= MAX_LATCH_NOTES) {
            // If we are at the limit, remove the oldest note
            noteToTurnOff = this.activeNotes.shift(); 
            if (noteToTurnOff) {
                noteToAnimateRemove = { id: noteToTurnOff.id };
            }
        }
        
        const id = this.nextId++;
        const newNote: Note & { x: number; y: number } = { id, frequency, volume, x, y };
        this.activeNotes.push(newNote);

        const result: LatchToggleResult = {
            action: 'added',
            noteOn: newNote,
            noteOff: noteToTurnOff,
            noteToAnimateAdd: { id: newNote.id, x, y },
            noteToAnimateRemove: noteToAnimateRemove
        };
        
        return result;
    }
    
    public clear(): Note[] {
        const notesToTurnOff = [...this.activeNotes];
        this.activeNotes = [];
        return notesToTurnOff;
    }

    public getActiveNotes(): readonly Note[] {
        return this.activeNotes;
    }
}

    