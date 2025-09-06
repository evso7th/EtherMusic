
import type { Note } from '@/types';

const MAX_LATCH_NOTES = 4;
const TAP_RADIUS = 30; // pixels
const TAP_RADIUS_SQUARED = TAP_RADIUS * TAP_RADIUS;

export type LatchToggleResult = {
    action: 'added' | 'removed' | 'none';
    noteOn?: Note;
    noteOff?: Note;
    noteToAnimateAdd?: { id: number; type: 'add' };
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
    private activeNotes: Note[] = [];

    // The unique ID for a note is now derived from its position on the pad.
    private positionToId(x: number, y: number): number {
        const gridX = Math.floor(x / TAP_RADIUS);
        const gridY = Math.floor(y / TAP_RADIUS);
        // Combine grid coordinates into a single unique ID
        return gridY * 1000 + gridX;
    }
    
    public toggleNote(tapData: TapData): LatchToggleResult {
        const id = this.positionToId(tapData.x, tapData.y);
        console.log(`[LatchEngine] toggleNote called with tapId: ${id}. Active notes: (${this.activeNotes.length})`, this.activeNotes.map(n => n.id));

        const existingNoteIndex = this.activeNotes.findIndex(note => note.id === id);

        if (existingNoteIndex > -1) {
            // Note exists, remove it.
            const noteToRemove = this.activeNotes.splice(existingNoteIndex, 1)[0];
            console.log('[LatchEngine] Removing existing note:', noteToRemove);
            return {
                action: 'removed',
                noteOff: noteToRemove,
                noteToAnimateRemove: { id: noteToRemove.id, type: 'remove' }
            };
        }
        
        let noteToTurnOff: Note | undefined;
        let noteToAnimateRemove: { id: number, type: 'remove' } | undefined;

        if (this.activeNotes.length >= MAX_LATCH_NOTES) {
            // Max notes reached, remove the oldest note.
            noteToTurnOff = this.activeNotes.shift(); 
            console.log('[LatchEngine] Max notes reached. Removing oldest note:', noteToTurnOff);
            if (noteToTurnOff) {
                noteToAnimateRemove = { id: noteToTurnOff.id, type: 'remove' };
            }
        }
        
        const newNote: Note = { id, frequency: tapData.frequency, volume: tapData.volume };
        this.activeNotes.push(newNote);
        console.log('[LatchEngine] Adding new note:', newNote);

        const result: LatchToggleResult = {
            action: 'added',
            noteOn: newNote,
            noteOff: noteToTurnOff,
            noteToAnimateAdd: { id: newNote.id, type: 'add' },
            noteToAnimateRemove: noteToAnimateRemove
        };
        
        console.log('[LatchEngine] toggleNote result:', result);
        return result;
    }
    
    public clear(): Note[] {
        console.log('[LatchEngine] Clearing all notes.');
        const notesToTurnOff = [...this.activeNotes];
        this.activeNotes = [];
        return notesToTurnOff;
    }

    public getActiveNotes(): readonly Note[] {
        return this.activeNotes;
    }
}

    