
"use client";

import type { Note } from '@/types';

const MAX_LATCH_NOTES = 4;
const TAP_RADIUS = 40; // Increased radius for easier tapping
const TAP_RADIUS_SQUARED = TAP_RADIUS * TAP_RADIUS;

export type LatchToggleResult = {
    action: 'added' | 'removed' | 'none';
    noteOn?: Note;
    noteOff?: Note;
    noteToAnimateAdd?: { id: number; x: number; y: number; type: 'add' };
    noteToAnimateRemove?: { id: number; type: 'remove' };
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
            const isNearby = distSq < TAP_RADIUS_SQUARED;
            // console.log(`[LatchEngine] Checking distance for note ${note.id}: tap at (${x.toFixed(1)}, ${y.toFixed(1)}), note at (${note.x.toFixed(1)}, ${note.y.toFixed(1)}), distSq=${distSq.toFixed(1)}, radiusSq=${TAP_RADIUS_SQUARED}. Is nearby: ${isNearby}`);
            return isNearby;
        });
    }

    public toggleNote(tapData: TapData): LatchToggleResult {
        if (!tapData) return { action: 'none' };
        
        const { x, y, frequency, volume } = tapData;
        const existingNoteIndex = this.findNearbyNoteIndex(x, y);

        // console.log(`[LatchEngine] toggleNote called. Tap at (${x.toFixed(1)}, ${y.toFixed(1)}). Active notes: (${this.activeNotes.length})`, this.activeNotes.map(n => n.id));

        if (existingNoteIndex > -1) {
            const noteToRemove = this.activeNotes.splice(existingNoteIndex, 1)[0];
            // console.log('[LatchEngine] Removing existing note:', noteToRemove);
            return {
                action: 'removed',
                noteOff: noteToRemove,
                noteToAnimateRemove: { id: noteToRemove.id, type: 'remove' }
            };
        }
        
        let noteToTurnOff: Note | undefined;
        let noteToAnimateRemove: { id: number, type: 'remove' } | undefined;

        if (this.activeNotes.length >= MAX_LATCH_NOTES) {
            noteToTurnOff = this.activeNotes.shift(); 
            // console.log('[LatchEngine] Max notes reached. Removing oldest note:', noteToTurnOff);
            if (noteToTurnOff) {
                noteToAnimateRemove = { id: noteToTurnOff.id, type: 'remove' };
            }
        }
        
        const id = this.nextId++;
        const newNote: Note & { x: number; y: number } = { id, frequency, volume, x, y };
        this.activeNotes.push(newNote);
        // console.log('[LatchEngine] Adding new note:', newNote);

        const result: LatchToggleResult = {
            action: 'added',
            noteOn: newNote,
            noteOff: noteToTurnOff,
            noteToAnimateAdd: { id: newNote.id, x, y, type: 'add' },
            noteToAnimateRemove: noteToAnimateRemove
        };
        
        // console.log('[LatchEngine] toggleNote result:', result);
        return result;
    }
    
    public clear(): Note[] {
        // console.log('[LatchEngine] Clearing all notes.');
        const notesToTurnOff = [...this.activeNotes];
        this.activeNotes = [];
        return notesToTurnOff;
    }

    public getActiveNotes(): readonly Note[] {
        return this.activeNotes;
    }
}
