
"use client";

import type { Note } from '@/types';
import type { OrbManager } from './orb-manager';

const MAX_LATCH_NOTES = 3;
const TAP_RADIUS = 30;
const TAP_RADIUS_SQUARED = TAP_RADIUS * TAP_RADIUS;

export type LatchToggleResult = {
    action: 'added' | 'removed' | 'none';
    noteOn?: Note;
    noteOff?: Note;
    noteToAnimateAdd?: { id: number; x: number; y: number; };
    noteToAnimateRemove?: { id: number };
    channelIndex?: number; // The channel that was used or freed
};

interface TapData {
    frequency: number;
    volume: number;
    pointerId: number;
    x: number;
    y: number;
}

export class LatchEngine {
    private activeNotes: (Note & { x: number; y: number; channelIndex: number })[] = [];
    private nextId = 0;
    private orbManager: OrbManager | null = null;
    private channelPool = [0, 1, 2]; // Pool of available channel indices

    public setOrbManager(manager: OrbManager | null) {
        this.orbManager = manager;
    }

    private findNearbyNoteIndex(x: number, y: number): number {
        return this.activeNotes.findIndex(note => {
            const distSq = (note.x - x) ** 2 + (note.y - y) ** 2;
            return distSq < TAP_RADIUS_SQUARED;
        });
    }

    public toggleNote(tapData: TapData): LatchToggleResult {
        if (!tapData) {
            return { action: 'none' };
        }
        
        const { x, y, frequency, volume } = tapData;
        const existingNoteIndex = this.findNearbyNoteIndex(x, y);

        if (existingNoteIndex > -1) {
            // Note exists, remove it
            const noteToRemove = this.activeNotes.splice(existingNoteIndex, 1)[0];
            this.channelPool.push(noteToRemove.channelIndex); // Return channel to pool
            this.channelPool.sort((a, b) => a - b); // Keep it sorted for predictability
            return {
                action: 'removed',
                noteOff: noteToRemove,
                noteToAnimateRemove: { id: noteToRemove.id },
                channelIndex: noteToRemove.channelIndex,
            };
        }
        
        // Note doesn't exist, add it
        let noteToTurnOff: Note & { channelIndex: number } | undefined;
        let noteToAnimateRemove: { id: number } | undefined;
        let channelToUse: number;

        if (this.activeNotes.length >= MAX_LATCH_NOTES) {
            // If we are at the limit, remove the oldest note
            noteToTurnOff = this.activeNotes.shift(); 
            if (noteToTurnOff) {
                noteToAnimateRemove = { id: noteToTurnOff.id };
                channelToUse = noteToTurnOff.channelIndex; // Reuse the channel
            } else {
                 return { action: 'none' };
            }
        } else {
            // Use a free channel from the pool
            const channel = this.channelPool.shift();
            if(channel === undefined) {
                 return { action: 'none' };
            }
            channelToUse = channel;
        }
        
        const id = this.nextId++;
        const newNote = { id, frequency, volume, x, y, channelIndex: channelToUse };
        this.activeNotes.push(newNote);

        const result: LatchToggleResult = {
            action: 'added',
            noteOn: newNote,
            noteOff: noteToTurnOff,
            noteToAnimateAdd: { id: newNote.id, x, y },
            noteToAnimateRemove: noteToAnimateRemove,
            channelIndex: channelToUse
        };
        
        return result;
    }
    
    public clear(): (Note & { channelIndex: number })[] {
        const notesToTurnOff = [...this.activeNotes];
        this.activeNotes = [];
        this.channelPool = [0, 1, 2]; // Reset channel pool
        return notesToTurnOff;
    }

    public getActiveNotes(): readonly Note[] {
        return this.activeNotes;
    }
}
