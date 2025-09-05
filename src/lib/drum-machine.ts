
// This file is now simplified. The core scheduling logic will move to the
// `drum-processor.js` AudioWorklet. This class might become a simple
// manager or be removed entirely, but we'll keep it for now.

export const beatPatterns = [
    { name: 'Air', type: 'Meditative' },
    { name: 'Earth', type: 'Meditative' },
    { name: 'Water', type: 'Meditative' },
    { name: 'Tibet', type: 'Meditative' },
    { name: 'Space', type: 'Meditative' },
    { name: 'Toccata', type: 'Classic' },
    { name: 'Promenade', type: 'Classic' },
    { name: 'Nocturne', type: 'Classic' },
    { name: 'Scherzo', type: 'Classic' },
    { name: 'Aria', type: 'Classic' },
    { name: 'Off', type: 'System' },
];

// The DrumMachine class can be removed or repurposed later.
// For now, we'll keep the pattern data here.
export class DrumMachine {
    // The actual Tone.js Players and Part will be removed,
    // as this logic moves to the AudioWorklet.
}

    