
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

export class LatchEngine {
    private activeNotes: Note[] = [];

    public toggleNote(id: number, frequency: number, volume: number): LatchToggleResult {
        console.log(`[LatchEngine] toggleNote called with id: ${id}. Active notes: (${this.activeNotes.length})`, this.activeNotes.map(n => n.id));
        const existingNoteIndex = this.findNearbyNoteIndex(id);

        if (existingNoteIndex > -1) {
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
            noteToTurnOff = this.activeNotes.shift(); // Remove the oldest note
            console.log('[LatchEngine] Max notes reached. Removing oldest note:', noteToTurnOff);
            if (noteToTurnOff) {
                noteToAnimateRemove = { id: noteToTurnOff.id, type: 'remove' };
            }
        }
        
        const newNote: Note = { id, frequency, volume };
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

    private positionFromId(id: number): { x: number, y: number } {
        const x = Math.floor(id / 1000) * 30 + 15;
        const y = (id % 1000) * 30 + 15;
        return { x, y };
    }
    
    private findNearbyNoteIndex(id: number): number {
        const tapPos = this.positionFromId(id);

        return this.activeNotes.findIndex(note => {
            const notePos = this.positionFromId(note.id);
            const distanceSq = Math.pow(tapPos.x - notePos.x, 2) + Math.pow(tapPos.y - notePos.y, 2);
            const isNearby = distanceSq < TAP_RADIUS_SQUARED;
            if (isNearby) {
                console.log(`[LatchEngine] Found nearby note: tapId=${id}, existingId=${note.id}, distSq=${distanceSq}`);
            }
            return isNearby;
        });
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
