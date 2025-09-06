
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

export type BeatPattern = typeof beatPatterns[number];
