import type { Note } from '@/types';

const MAX_LATCH_NOTES = 4;
const TAP_RADIUS_SQUARED = 900; // (30px)^2

export type LatchToggleResult = {
    action: 'added' | 'removed' | 'none';
    noteOn?: Note;
    noteOff?: Note;
    noteToAnimateAdd?: { id: number, type: 'add' };
    noteToAnimateRemove?: { id: number, type: 'remove' };
};

export class LatchEngine {
    private activeNotes: Note[] = [];

    public toggleNote(id: number, frequency: number, volume: number): LatchToggleResult {
        const existingNoteIndex = this.findNearbyNoteIndex(id);

        if (existingNoteIndex > -1) {
            const noteToRemove = this.activeNotes.splice(existingNoteIndex, 1)[0];
            return {
                action: 'removed',
                noteOff: noteToRemove,
                noteToAnimateRemove: { id: noteToRemove.id, type: 'remove' }
            };
        }
        
        let noteToTurnOff: Note | undefined;
        let noteToAnimateRemove: { id: number, type: 'remove' } | undefined;

        if (this.activeNotes.length >= MAX_LATCH_NOTES) {
            noteToTurnOff = this.activeNotes.shift(); // Remove the oldest note
            if (noteToTurnOff) {
                noteToAnimateRemove = { id: noteToTurnOff.id, type: 'remove' };
            }
        }
        
        const newNote: Note = { id, frequency, volume };
        this.activeNotes.push(newNote);

        const result: LatchToggleResult = {
            action: 'added',
            noteOn: newNote,
            noteOff: noteToTurnOff,
            noteToAnimateAdd: { id: newNote.id, type: 'add' },
            noteToAnimateRemove: noteToAnimateRemove
        };

        return result;
    }

    private findNearbyNoteIndex(id: number): number {
        // Since id is based on position, we check for proximity
        const x = Math.floor(id / 1000);
        const y = id % 1000;

        return this.activeNotes.findIndex(note => {
            const noteX = Math.floor(note.id / 1000);
            const noteY = note.id % 1000;
            const distanceSq = Math.pow(x - noteX, 2) + Math.pow(y - noteY, 2);
            return distanceSq < TAP_RADIUS_SQUARED;
        });
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
