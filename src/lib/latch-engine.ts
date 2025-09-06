import type { Note } from '@/types';

const MAX_LATCH_NOTES = 4;
const TAP_RADIUS_SQUARED = 400; // (20px)^2

export type LatchToggleResult = {
    action: 'added' | 'removed' | 'none';
    noteOn?: Note;
    noteOff?: Note;
    noteToAnimate?: { id: number, type: 'add' | 'remove'};
};

export class LatchEngine {
    private activeNotes: Note[] = [];

    public toggleNote(id: number, frequency: number, volume: number): LatchToggleResult {
        console.log(`[LatchEngine] toggleNote called with id: ${id}. Active notes:`, this.activeNotes.map(n => n.id));
        const existingNoteIndex = this.findNearbyNoteIndex(id);

        if (existingNoteIndex > -1) {
            const noteToRemove = this.activeNotes.splice(existingNoteIndex, 1)[0];
            console.log(`[LatchEngine] Removing existing note:`, noteToRemove);
            return {
                action: 'removed',
                noteOff: noteToRemove,
                noteToAnimate: { id: noteToRemove.id, type: 'remove' }
            };
        }
        
        let noteToTurnOff: Note | undefined;
        let noteToAnimateRemove: { id: number, type: 'remove' } | undefined;

        if (this.activeNotes.length >= MAX_LATCH_NOTES) {
            noteToTurnOff = this.activeNotes.shift(); // Remove the oldest note
            if (noteToTurnOff) {
                console.log(`[LatchEngine] Max notes reached. Removing oldest note:`, noteToTurnOff);
                noteToAnimateRemove = { id: noteToTurnOff.id, type: 'remove' };
            }
        }
        
        const newNote: Note = { id, frequency, volume };
        this.activeNotes.push(newNote);
        console.log(`[LatchEngine] Adding new note:`, newNote, `Active notes now:`, this.activeNotes.map(n => n.id));

        const result: LatchToggleResult = {
            action: 'added',
            noteOn: newNote,
            noteOff: noteToTurnOff,
            noteToAnimate: { id: newNote.id, type: 'add' }
        };

        if (noteToAnimateRemove) {
            // This is a bit of a hack to chain animations, but it will work for now.
            // A better solution would be to return an array of animations.
            // Let's just process the remove animation first in the audio engine.
            this.processAnimation(noteToAnimateRemove);
        }

        return result;
    }

    // This is a placeholder for a more robust animation system
    private processAnimation(animation: { id: number, type: 'add' | 'remove'}) {
         if (typeof (globalThis as any).orbManager !== 'undefined') {
            if (animation.type === 'remove') {
                (globalThis as any).orbManager.removeOrb(animation.id);
            }
        }
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
        console.log('[LatchEngine] Clearing all notes.');
        const notesToTurnOff = [...this.activeNotes];
        this.activeNotes = [];
        return notesToTurnOff;
    }

    public getActiveNotes(): readonly Note[] {
        return this.activeNotes;
    }
}
