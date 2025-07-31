
import type { AutopilotStyle } from '@/app/page';

// --- TYPE DEFINITIONS ---
export type NoteEvent = {
    time: string;
    freq: number;
    dur: string;
    vel: number;
};

export type Frequencies = {
    bass: number[];
    melody: number[];
};


// --- L-SYSTEM CORE ---
/**
 * Generates a sequence string based on L-system rules.
 * @param axiom The starting string.
 * @param rules The replacement rules.
 * @param iterations The number of times to apply the rules.
 * @returns The final generated string.
 */
function generateLSystemSequence(axiom: string, rules: Record<string, string>, iterations: number): string {
    let currentString = axiom;
    for (let i = 0; i < iterations; i++) {
        currentString = currentString.split('').map(char => rules[char] || char).join('');
    }
    return currentString;
}

/**
 * Interprets an L-system string and generates musical notes for a 4-measure loop.
 * @param sequence The L-system string.
 * @param freqs The available frequencies for the melody.
 * @param initialNoteIndex The starting note index in the freqs array.
 * @param timeStep The duration of each character step in "16n" units.
 * @param baseDuration The base duration of a note.
 * @param baseVelocity The base velocity of a note.
 * @returns An array of NoteEvent objects.
 */
function interpretLSystem(
    sequence: string,
    freqs: number[],
    initialNoteIndex: number,
    timeStep: number, // in 16th notes
    baseDuration: string,
    baseVelocity: number
): NoteEvent[] {
    const notes: NoteEvent[] = [];
    let currentTime = 0;
    let currentNoteIndex = initialNoteIndex;
    const noteIndexStack: number[] = [];
    const MAX_TIME = 64; // 4 measures * 16 sixteenths

    for (const char of sequence) {
        if (currentTime >= MAX_TIME) break;

        switch (char) {
            case 'F': // Play a note, move forward
            case 'G':
            case 'A':
            case 'B':
                if (currentNoteIndex >= 0 && currentNoteIndex < freqs.length) {
                    const m = Math.floor(currentTime / 16);
                    const b = Math.floor((currentTime % 16) / 4);
                    const s = currentTime % 4;
                    notes.push({
                        time: `${m}:${b}:${s}`,
                        freq: freqs[currentNoteIndex],
                        dur: baseDuration,
                        vel: baseVelocity + (Math.random() - 0.5) * 0.1,
                    });
                }
                currentTime += timeStep;
                break;
            case '+': // Go up one step in the scale
                currentNoteIndex = Math.min(freqs.length - 1, currentNoteIndex + 1);
                break;
            case '-': // Go down one step in the scale
                currentNoteIndex = Math.max(0, currentNoteIndex - 1);
                break;
            case '[': // Push current state to stack
                noteIndexStack.push(currentNoteIndex);
                break;
            case ']': // Pop state from stack
                if (noteIndexStack.length > 0) {
                    currentNoteIndex = noteIndexStack.pop()!;
                }
                break;
            case 'X': // Rest: just advance time
                 currentTime += timeStep;
                 break;
        }
    }
    // Remove duplicate notes at the same time, giving priority to the first one
    return Array.from(new Map(notes.map(note => [note.time, note])).values());
}


// --- MAIN GENERATION LOGIC ---
export function generateAutopilotPattern(style: AutopilotStyle, freqs: Frequencies): { bassPattern: NoteEvent[], melodyPattern: NoteEvent[] } {
    let bassPattern: NoteEvent[] = [];
    let melodyPattern: NoteEvent[] = [];

    const baseNote = freqs.bass[0];
    const fifthNote = freqs.bass.find(f => f > baseNote * 1.4 && f < baseNote * 1.6) || freqs.bass[Math.min(4, freqs.bass.length - 1)];

    // --- Bass Pattern Generation (consistent across most styles) ---
    // A simple, looping bass pattern often works best to ground the evolving melody.
    for (let i = 0; i < 8; i++) { // Two notes per measure
        const measure = Math.floor(i / 2);
        const beat = (i % 2) * 2;
        const time = `${measure}:${beat}:0`;
        const freq = (i % 4 === 0) ? baseNote : (fifthNote || baseNote); // Root on 1, Fifth on 3
        bassPattern.push({ time, freq, dur: '2n', vel: 0.4 });
    }
    
    // --- Melody Pattern Generation using L-Systems ---
    const startIdx = Math.floor(freqs.melody.length / 3);
    let axiom = 'F';
    let rules = {};
    let iterations = 2;
    let timeStep = 4; // 4 * 16n = quarter note
    let duration = '4n';
    let velocity = 0.5;

    switch (style) {
        case 'Ambient':
            axiom = 'A';
            rules = { 'A': 'F[+A][-A]F', 'F': 'G', 'G':'A' };
            iterations = 4;
            timeStep = 16; // whole note
            duration = '2m';
            velocity = 0.3;
            break;

        case 'House':
        case 'Sequence':
            axiom = 'F+F-F';
            rules = { 'F': 'F[+F-F]X' };
            iterations = 4;
            timeStep = 2; // 8th note
            duration = '8n';
            velocity = 0.6;
            break;

        case 'Wind':
            axiom = 'A';
            rules = { 'A': 'F[+A]F[-A]A', 'F': 'G[+F]G[-F]' };
            iterations = 3;
            timeStep = 1; // 16th note
            duration = '16n';
            velocity = 0.4;
            break;

        case 'Chimes':
            const highFreqs = freqs.melody.slice(Math.floor(freqs.melody.length / 2));
            axiom = 'F';
            rules = { 'F': 'G[+F]G[-F]' };
            iterations = 4;
            timeStep = 4; // quarter note
            duration = '2n'; // longer duration for chime effect
            velocity = 0.7;
            melodyPattern = interpretLSystem(generateLSystemSequence(axiom, rules, iterations), highFreqs, Math.floor(highFreqs.length/2), timeStep, duration, velocity);
            break;

        case 'Drone':
            bassPattern.length = 0; // Override default bass
            bassPattern.push({ time: '0:0:0', freq: baseNote, dur: '4m', vel: 0.5 });
            if(fifthNote) bassPattern.push({ time: '2:0:0', freq: fifthNote, dur: '2m', vel: 0.4 });
            melodyPattern = []; // No melody
            break;
            
        case 'Primes': // Kept the original logic as it's non-L-system based
             // Bass: A simple root-fifth progression to ground the melody.
            bassPattern.push({ time: '0:0:0', freq: baseNote, dur: '2m', vel: 0.5 });
            if (fifthNote) {
                bassPattern.push({ time: '2:0:0', freq: fifthNote, dur: '2m', vel: 0.45 });
            }
            const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61];
            primes.forEach((prime, index) => {
                const timeSixteenth = (prime + index) % 64;
                const m = Math.floor(timeSixteenth / 16);
                const b = Math.floor((timeSixteenth % 16) / 4);
                const s = timeSixteenth % 4;
                melodyPattern.push({
                    time: `${m}:${b}:${s}`,
                    freq: freqs.melody[prime % freqs.melody.length],
                    dur: '8n',
                    vel: 0.5 + Math.random() * 0.2,
                });
            });
            break;

        case 'Space':
            axiom = 'F';
            rules = { 'F': 'F[+F]XF[-F]XF' };
            iterations = 3;
            timeStep = 8; // half note
            duration = '1m';
            velocity = 0.4;
            break;

        case 'Toccata':
            axiom = 'F+G-';
            rules = { 'F': 'F+G-', 'G': 'F-F+' };
            iterations = 4;
            timeStep = 1; // 16th note
            duration = '16n';
            velocity = 0.7;
            break;

        case 'Promenade':
            axiom = 'A+B-';
            rules = { 'A': 'F+G', 'B': 'F-G', 'F':'A', 'G':'B' }; // Walk up and down
            iterations = 4;
            timeStep = 4; // quarter note
            duration = '4n';
            velocity = 0.55;
            break;
        
        default:
             break;
    }
    
    // Generate and interpret only if it's not a special case like Chimes/Drone/Primes
    if (style !== 'Chimes' && style !== 'Drone' && style !== 'Primes') {
        const sequence = generateLSystemSequence(axiom, rules, iterations);
        melodyPattern = interpretLSystem(sequence, freqs.melody, startIdx, timeStep, duration, velocity);
    }
    
    // Ensure bass pattern is unique by time
    const finalBass = Array.from(new Map(bassPattern.map(note => [note.time, note])).values());
    
    return { bassPattern: finalBass, melodyPattern };
}

    