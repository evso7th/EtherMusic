
import type { AutopilotStyle } from '@/app/page';

// Type definitions
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

// --- Helper Functions ---

/**
 * Generates prime numbers up to a given maximum using Sieve of Eratosthenes.
 * @param max The upper bound for prime number generation.
 * @returns An array of prime numbers.
 */
function getPrimes(max: number): number[] {
    const sieve = new Array(max).fill(true);
    sieve[0] = sieve[1] = false;
    for (let i = 2; i * i < max; i++) {
        if (sieve[i]) {
            for (let j = i * i; j < max; j += i) {
                sieve[j] = false;
            }
        }
    }
    return sieve.reduce((primes, isPrime, num) => {
        if (isPrime) primes.push(num);
        return primes;
    }, [] as number[]);
}


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
    const MAX_TIME = 64; // 4 measures * 16 sixteenths

    for (const char of sequence) {
        if (currentTime >= MAX_TIME) break;

        switch (char) {
            case 'F': // Play a note
            case 'G':
            case 'A':
            case 'B':
                if (currentNoteIndex >= 0 && currentNoteIndex < freqs.length) {
                    const m = Math.floor(currentTime / 16);
                    const b = Math.floor((currentTime % 16) / 4);
                    const s = currentTime % 4;
                    const time = `${m}:${b}:${s}`;
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
            case 'X': // Rest
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
    let melodyPattern: NoteEvent[] = [];

    const baseNote = freqs.bass[0];
    const fifthNote = freqs.bass.find(f => f > baseNote * 1.4 && f < baseNote * 1.6) || freqs.bass[Math.min(4, freqs.bass.length - 1)];

    switch (style) {
        case 'Ambient': {
             // Bass: Soft, pulsing eighth-note riff between root and fifth.
             for (let i = 0; i < 32; i++) { // 32 eighth notes over 4 measures
                const m = Math.floor(i / 8);
                const b = Math.floor((i % 8) / 2);
                const s = (i % 2) * 2; // on 0 and 2
                const time = `${m}:${b}:${s}`;
                const freq = (i % 8 < 4) ? baseNote : (fifthNote || baseNote);
                bassPattern.push({ time, freq, dur: '8n', vel: 0.3 });
             }

            // Melody: Slow, sparse notes using a simple L-system for gentle evolution
            const sequence = generateLSystemSequence('F-F++F-F', { 'F': 'F-F++F-F' }, 2);
            const initialMelodyIndex = Math.floor(freqs.melody.length / 2);
            melodyPattern = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 16, '1m', 0.4);
            break;
        }

        case 'House': 
        case 'Sequence': {
             // Bass: A steady, pulsing quarter note, occasionally hitting the fifth.
            for (let i = 0; i < 16; i++) { // Loop over 16 beats (4 measures)
                const m = Math.floor(i / 4);
                const b = i % 4;
                const time = `${m}:${b}:0`;
                // Hit the fifth on the third measure
                const freq = m === 2 ? fifthNote : baseNote;
                bassPattern.push({ time, freq, dur: '4n', vel: 0.6 });
            }

            // Melody: Classic arpeggiator-style sequence using the stack
            const rules = { 'A': 'F+F-F[A]F-F+F', 'F': 'G', 'G': 'F' };
            const sequence = generateLSystemSequence('A-F+A', rules, 3);
            const initialMelodyIndex = Math.floor(freqs.melody.length / 3);
            melodyPattern = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 2, '16n', 0.5);
            break;
        }

        case 'Wind': {
            // No bass for a light, airy feel
            // Melody: Fast, fluttering notes using +/- for rapid pitch changes
            const rules = { 'A': 'F+F-F+F-F[--A]', 'F': 'G', 'G': 'A' };
            const sequence = generateLSystemSequence('F+F-A', rules, 4);
             const initialMelodyIndex = Math.floor(freqs.melody.length / 2);
            melodyPattern = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 1, '32n', 0.3);
            break;
        }
        
        case 'Chimes': {
             // No bass
             // Melody: High-pitched, sparse, using the stack for "cascading" effects
            const highFreqs = freqs.melody.slice(Math.floor(freqs.melody.length / 2));
            const rules = { 'A': 'G[+A]F[-A]G' , 'F': 'G', 'G': 'F'};
            const sequence = generateLSystemSequence('G[+A]F', rules, 3);
            const initialMelodyIndex = Math.floor(highFreqs.length / 2);
            melodyPattern = interpretLSystem(sequence, highFreqs, initialMelodyIndex, 4, '8n', 0.6);
            break;
        }

        case 'Drone': {
            // Bass: Sustained root note with a rhythmic pulse on the fifth.
            bassPattern.push({ time: '0:0:0', freq: baseNote, dur: '4m', vel: 0.5 });
            if (fifthNote) {
                 for (let i = 0; i < 8; i++) { // every half note
                    const m = Math.floor(i / 2);
                    const b = (i % 2) * 2;
                    bassPattern.push({ time: `${m}:${b}:0`, freq: fifthNote, dur: '8n', vel: 0.4 });
                 }
            }
            // No melody, just the bass drone.
            break;
        }

        case 'Primes': {
            // Bass: A simple root-fifth progression to ground the melody.
            bassPattern.push({ time: '0:0:0', freq: baseNote, dur: '2m', vel: 0.5 });
            if (fifthNote) {
                bassPattern.push({ time: '2:0:0', freq: fifthNote, dur: '2m', vel: 0.45 });
            }
            
            // Melody: Generated from prime numbers
            const primes = getPrimes(64); 
            let currentTime = 0; // in 16th notes
            primes.forEach(prime => {
                if (currentTime >= 64) return; // Stay within 4 measures

                const m = Math.floor(currentTime / 16);
                const b = Math.floor((currentTime % 16) / 4);
                const s = currentTime % 4;
                const time = `${m}:${b}:${s}`;
                
                const freq = freqs.melody[prime % freqs.melody.length];
                
                melodyPattern.push({
                    time,
                    freq,
                    dur: '8n',
                    vel: 0.5 + Math.random() * 0.2,
                });

                // The next note's time is advanced by a scaled prime value
                currentTime += Math.floor(prime / 8) + 1; 
            });
            break;
        }
        
        case 'Toccata': {
            // Bass: Rhythmic, driving riff that outlines the harmony.
            for (let i = 0; i < 16; i++) {
                const m = Math.floor(i/4);
                const b = i % 4;
                const time = `${m}:${b}:0`;
                if (i % 4 === 0) { // Downbeat
                    bassPattern.push({ time, freq: baseNote, dur: '4n', vel: 0.7 });
                } else if (i % 4 === 2 && fifthNote) { // Third beat
                    bassPattern.push({ time, freq: fifthNote, dur: '4n', vel: 0.6 });
                }
            }

            // Melody: Fast, cascading arpeggios, characteristic of a toccata
            const rules = {
                'A': 'GF-E-D-C-B-A', // Descending scale run
                'B': '[+A][-A]', // Branching runs
                'C': 'A-B-C'
            };
            const sequence = generateLSystemSequence('A-B', rules, 3);
            const initialMelodyIndex = freqs.melody.length - 1; // Start high
            melodyPattern = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 1, '32n', 0.6);
            break;
        }

        case 'Promenade': {
            // Bass: mimics the stately walk of the promenade theme with a classic I-V-I progression
             for (let i = 0; i < 8; i++) {
                const m = Math.floor(i / 2);
                const b = (i * 2) % 4;
                const time = `${m}:${b}:0`;
                let freq = baseNote;
                if (m === 1 || m === 3) freq = fifthNote;
                if (m === 2) freq = baseNote;
                bassPattern.push({ time, freq, dur: '4n', vel: 0.6 });
            }
             
            // Melody: L-system capturing the rhythmic and melodic character of Mussorgsky's theme
            const rules = {
                'A': 'FGXFGAX', // Main phrase
                'B': 'GAGFEX' // Contrasting phrase
            };
            const sequence = generateLSystemSequence('AXABX', rules, 2);
            const initialMelodyIndex = Math.floor(freqs.melody.length / 3);
            // Slower time step to give it a walking pace
            melodyPattern = interpretLSystem(sequence, freqs.melody, initialMelodyIndex, 2, '8n', 0.55);
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

        let patternDurationSixteenths = 0;
        if (pattern.length > 0) {
            const lastNote = pattern[pattern.length - 1];
            const [m, b, s] = lastNote.time.split(':').map(Number);
            patternDurationSixteenths = m * 16 + b * 4 + s + 4; // Add buffer for last note duration
        }

        if (patternDurationSixteenths === 0) return [];
        
        const looped = [];
        let currentSixteenth = 0;
        
        while(currentSixteenth < totalSixteenths) {
            for(const note of pattern) {
                 const [m, b, s] = note.time.split(':').map(Number);
                 const noteTimeInSixteenths = m * 16 + b * 4 + s;
                 const newTime = currentSixteenth + noteTimeInSixteenths;
                 
                 if (newTime < totalSixteenths) {
                    const newM = Math.floor(newTime / 16);
                    const newB = Math.floor((newTime % 16) / 4);
                    const newS = newTime % 4;
                    looped.push({...note, time: `${newM}:${newB}:${newS}`});
                 }
            }
            currentSixteenth += patternDurationSixteenths;
        }

        const uniqueNotes = Array.from(new Map(looped.map(n => [n.time, n])).values());
        return uniqueNotes;
    }
    
    // Looping melody to fill 4 measures.
    const loopedMelody = loopPattern(melodyPattern, 4);

    return { bassPattern, melodyPattern: loopedMelody };
}
