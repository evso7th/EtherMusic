
export const beatPatterns = [
    { name: 'Air', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 0.5, note: 'h' }] },
    { name: 'Earth', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 0.5, note: 's' }] },
    { name: 'Water', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 't' }, { time: 0.25, note: 'H' }, { time: 0.5, note: 'T' }, { time: 0.75, note: 'H' }] },
    { name: 'Tibet', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'l' }, { time: 0.5, note: 'y' }] },
    { name: 'Space', type: 'Meditative', length: 1, sequence: [{ time: 0, note: 'k' }, { time: 0.33, note: 'h' }, { time: 0.66, note: 'y' }] },
    { name: 'Toccata', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 0.125, note: 'H' }, { time: 0.25, note: 'k' }, { time: 0.375, note: 'H' },
        { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'k' }, { time: 0.875, note: 'H' },
    ]},
    { name: 'Nocturne', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k', vol: 0.8 }, { time: 0.25, note: 'H' }, { time: 0.5, note: 's', vol: 0.6 }, { time: 0.625, note: 'H', vol: 0.5 }, { time: 0.75, note: 'H' },
    ]},
    { name: 'Scherzo', type: 'Classic', length: 1, sequence: [
        { time: 0, note: 'k' }, { time: 0.25, note: 't' }, { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'T' },
    ]},
    { name: 'Aria', type: 'Classic', length: 1, sequence: [{ time: 0, note: 'c', vol: 0.7 }, { time: 0.5, note: 'b', vol: 0.9 }] },
    { name: 'Off', type: 'System', length: 1, sequence: [] },
];

export type BeatPattern = typeof beatPatterns[number];
