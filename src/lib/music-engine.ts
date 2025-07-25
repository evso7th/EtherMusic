
import type { AutopilotStyle } from '@/app/page';

// Type definitions
type NoteEvent = {
    time: string;
    freq: number;
    dur: string;
    vel: number;
};

type Frequencies = {
    bass: number[];
    melody: number[];
};

// --- Advanced L-System Music Engine ---

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
        let newString = '';
        for (const char of currentString) {
            newString += rules[char] || char;
        }
        currentString = newString;
    }
    return currentString;
}

/**
 * Interprets an L-system string and generates musical notes.
 * @param sequence The L-system string.
 * @param freqs The available frequencies for the melody.
 * @param initialNoteIndex The starting note index in the freqs array.
 * @param timeStep The duration of each step in "16n" units.
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

    for (const char of sequence) {
        switch (char) {
            case 'F': // Play a note
            case 'G':
                if (currentNoteIndex >= 0 && currentNoteIndex < freqs.length) {
                    const time = `0:${Math.floor(currentTime / 4)}:${currentTime % 4}`;
                    notes.push({
                        time,
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
            case '[': // Push current note index to stack
                noteIndexStack.push(currentNoteIndex);
                break;
            case ']': // Pop note index from stack
                if (noteIndexStack.length > 0) {
                    currentNoteIndex = noteIndexStack.pop()!;
                }
                break;
            default: // Other characters can be used as "rests" or for other logic
                currentTime += timeStep;
                break;
        }
    }
    return notes;
}


// Main Generation Function
export function generateAutopilotPattern(style: AutopilotStyle, freqs: Frequencies): { bassPattern: NoteEvent[], melodyPattern: NoteEvent[] } {
    let bassPattern: NoteEvent[] = [];
    const melodyPattern: NoteEvent[] = [];

    const baseNote = freqs.bass[0];
    const fifthNote = freqs.bass.find(f => f > baseNote * 1.4 && f < baseNote * 1.6) || freqs.bass[Math.min(4, freqs.bass.length - 1)];

    switch (style) {
        case 'Ambient': {
             // Bass: Long, sustained drone notes
             bassPattern.push({ time: '0:0:0', freq: baseNote, dur: '4m', vel: 0.2 });
             if (fifthNote) {
                 bassPattern.push({ time: '0:0:0', freq: fifthNote, dur: '4m', vel: 0.15 });
             }

            // Melody: Slow, sparse notes using a simple L-system for gentle evolution
            const sequence = generateLSystemSequence('F', { 'F': 'F-F+F' }, 3);
            const initialMelodyIndex = Math.floor(freqs.melody.length / 2);
            const ambientNotes = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 16, '1m', 0.4);
            melodyPattern.push(...ambientNotes);
            break;
        }

        case 'House': // Changed to be more melodic and evolving
        case 'Sequence': {
             // Bass: A steady, pulsing root note
            for (let i = 0; i < 4; i++) {
                bassPattern.push({ time: `${i}:0:0`, freq: baseNote, dur: '2n', vel: 0.3 });
                bassPattern.push({ time: `${i}:2:0`, freq: fifthNote, dur: '4n', vel: 0.3 });
            }

            // Melody: Classic arpeggiator-style sequence using the stack
            const rules = { 'A': 'F+F-F[A]F-F+F', 'F': 'F' };
            const sequence = generateLSystemSequence('A', rules, 2);
            const initialMelodyIndex = Math.floor(freqs.melody.length / 3);
            const sequenceNotes = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 2, '16n', 0.5);
            melodyPattern.push(...sequenceNotes);
            break;
        }

        case 'Wind': {
            // No bass for a light, airy feel
            // Melody: Fast, fluttering notes using +/- for rapid pitch changes
            const rules = { 'A': 'F+F-F+F-F', 'F': 'A' };
            const sequence = generateLSystemSequence('A', rules, 4);
             const initialMelodyIndex = Math.floor(freqs.melody.length / 2);
            const windNotes = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 1, '32n', 0.3);
            melodyPattern.push(...windNotes);
            break;
        }
        
        case 'Chimes': {
             // No bass
             // Melody: High-pitched, sparse, using the stack for "cascading" effects
            const highFreqs = freqs.melody.slice(Math.floor(freqs.melody.length / 2));
            const rules = { 'A': 'F[+A][-A]F' };
            const sequence = generateLSystemSequence('A', rules, 3);
            const initialMelodyIndex = Math.floor(highFreqs.length / 2);
            const chimeNotes = interpretLSystem(sequence, highFreqs, initialMelodyIndex, 4, '8n', 0.6);
            melodyPattern.push(...chimeNotes);
            break;
        }

        case 'Drone': {
            // Bass: Two sustained notes for a classic drone
            bassPattern.push({ time: '0:0:0', freq: baseNote, dur: '4m', vel: 0.2 });
            if (fifthNote) {
                bassPattern.push({ time: '0:0:0', freq: fifthNote, dur: '4m', vel: 0.15 });
            }
            // No melody, just the bass drone.
            break;
        }

        default:
            break;
    }
    
    // The Tone.Part for melody is 4 measures long. This ensures we fill it.
    // We filter out notes that go beyond the 4 measure loop.
    const loopPattern = (pattern: NoteEvent[], measures: number): NoteEvent[] => {
        if (!pattern.length) return [];
        const totalSixteenths = measures * 16;
        const patternDuration = pattern.reduce((max, note) => {
            const [m, b, s] = note.time.split(':').map(Number);
            return Math.max(max, m * 16 + b * 4 + s);
        }, 0) + 4; // Add a buffer

        if (patternDuration === 0) return [];
        
        const looped = [];
        let currentTime = 0;
        let patternIndex = 0;
        while(currentTime < totalSixteenths) {
            const note = pattern[patternIndex % pattern.length];
            const [m, b, s] = note.time.split(':').map(Number);
            const noteTimeInSixteenths = m * 16 + b * 4 + s;
            
            const loopOffset = Math.floor(currentTime / patternDuration) * patternDuration;
            const newTimeInSixteenths = loopOffset + noteTimeInSixteenths;

            if (newTimeInSixteenths < totalSixteenths) {
                const newM = Math.floor(newTimeInSixteenths / 16);
                const newB = Math.floor((newTimeInSixteenths % 16) / 4);
                const newS = newTimeInSixteenths % 4;
                looped.push({...note, time: `${newM}:${newB}:${newS}`});
            }
            
            patternIndex++;
            // This is a simplified loop progression, assuming the next note in pattern follows
            currentTime = loopOffset + noteTimeInSixteenths + 4; // Assume avg 4/16th duration
        }
        // Remove duplicates
        const uniqueNotes = Array.from(new Map(looped.map(n => [n.time, n])).values());
        return uniqueNotes;
    }
    
    // Looping melody to fill 4 measures. Bass part is already set for 4 measures.
    const loopedMelody = loopPattern(melodyPattern, 4);

    return { bassPattern, melodyPattern: loopedMelody };
}
