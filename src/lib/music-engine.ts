
import { createNoise2D } from 'simplex-noise';
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

// L-System Generator
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

// Perlin/Simplex Noise Generator
const noise2D = createNoise2D();

// Main Generation Function
export function generateAutopilotPattern(style: AutopilotStyle, freqs: Frequencies): { bassPattern: NoteEvent[], melodyPattern: NoteEvent[] } {
    const bassPattern: NoteEvent[] = [];
    const melodyPattern: NoteEvent[] = [];
    let timeSeed = Math.random() * 1000;

    switch (style) {
        case 'Ambient': {
            // Bass: Long, sustained drone notes
            for (let i = 0; i < 2; i++) {
                const time = `${i * 2}:0:0`;
                const freq = freqs.bass[Math.floor(noise2D(timeSeed, i) * freqs.bass.length)];
                bassPattern.push({ time, freq, dur: '2m', vel: 0.2 + noise2D(i, timeSeed + 1) * 0.1 });
            }
            // Melody: Slow, sparse notes using Perlin noise for smooth transitions
            for (let i = 0; i < 8; i++) {
                const timeValue = noise2D(i * 0.2, timeSeed) * 8; // spread over 8 measures
                const time = `${Math.floor(timeValue)}:${Math.floor((timeValue % 1) * 4)}:0`;
                const freqIndex = Math.floor(((noise2D(i * 0.1, timeSeed + 10) + 1) / 2) * freqs.melody.length);
                const freq = freqs.melody[freqIndex];
                melodyPattern.push({ time, freq, dur: '1m', vel: 0.3 + Math.random() * 0.2 });
            }
            break;
        }

        case 'House': {
             // Bass: Simple, rhythmic pattern
            const baseNoteIndex = Math.floor(Math.random() * (freqs.bass.length / 2));
            for (let i = 0; i < 16; i++) {
                if (i % 4 === 0) {
                     const time = `0:${Math.floor(i/4)}:${i%4}`;
                     const freq = freqs.bass[baseNoteIndex];
                     bassPattern.push({ time, freq, dur: '8n', vel: 0.4 });
                }
            }
             // Melody: Rhythmic, arp-like sequence from L-system
            const lSystem = generateLSystemSequence('A', { 'A': 'AB', 'B': 'A' }, 4); // "ABAABABA"
            let step = 0;
            for (const char of lSystem) {
                 const time = `0:${Math.floor(step/4)}:${step%4}`;
                 const freqIndex = char === 'A' ? 5 : 8;
                 const freq = freqs.melody[Math.min(freqIndex, freqs.melody.length-1)];
                 melodyPattern.push({ time, freq, dur: '16n', vel: 0.5 + Math.random() * 0.2 });
                 step++;
            }
            break;
        }

        case 'Wind': {
            // No bass for a light, airy feel
            // Melody: Fast, fluttering notes across the scale
            for (let i = 0; i < 32; i++) {
                const timeValue = i * 0.25; // 16th notes
                const time = `0:${Math.floor(timeValue/4)}:${timeValue%4}`;
                const freqIndex = Math.floor(((noise2D(i * 0.3, timeSeed) + 1) / 2) * freqs.melody.length);
                const freq = freqs.melody[freqIndex];
                melodyPattern.push({ time, freq, dur: '8n', vel: 0.1 + Math.random() * 0.2 });
            }
            break;
        }

        case 'Sequence': {
            // Bass: A moving sequence using Perlin noise
            let lastNoteIndex = Math.floor(Math.random() * freqs.bass.length);
            for (let i = 0; i < 16; i++) {
                 const time = `0:${Math.floor(i/4)}:${i%4}`;
                 const noiseVal = noise2D(i * 0.4, timeSeed); // more rapid change
                 lastNoteIndex = (lastNoteIndex + Math.round(noiseVal * 3) + freqs.bass.length) % freqs.bass.length;
                 const freq = freqs.bass[lastNoteIndex];
                 bassPattern.push({ time, freq, dur: '16n', vel: 0.4 });
            }
            // Melody: Sparse notes complementing the bass
             for (let i = 0; i < 4; i++) {
                const time = `${i}:0:0`;
                const freq = freqs.melody[Math.floor(Math.random() * freqs.melody.length)];
                melodyPattern.push({ time, freq, dur: '2n', vel: 0.5 });
            }
            break;
        }
        
        case 'Chimes': {
             // Melody: High-pitched, random, bell-like sounds
             const highFreqs = freqs.melody.slice(Math.floor(freqs.melody.length / 2));
             const lSystem = generateLSystemSequence('A', { 'A': 'BC', 'B': 'A', 'C': 'B'}, 5);
             let step = 0;
             for (const char of lSystem) {
                 if (step > 32) break;
                 const timeValue = step * Math.random() * 2;
                 const time = `0:${Math.floor(timeValue/4)}:${timeValue%4}`;
                 const freq = highFreqs[Math.floor(Math.random() * highFreqs.length)];
                 const dur = ['8n', '4n'][Math.floor(Math.random()*2)];
                 melodyPattern.push({ time, freq, dur, vel: 0.4 + Math.random() * 0.2 });
                 step++;
             }
            break;
        }

        case 'Drone': {
            // Bass: Two sustained notes, a root and a fifth, for a classic drone
            const rootNote = freqs.bass[0];
            const fifthNote = freqs.bass.find(f => f > rootNote * 1.4 && f < rootNote * 1.6) || freqs.bass[Math.min(4, freqs.bass.length-1)];
            bassPattern.push({ time: '0:0:0', freq: rootNote, dur: '4m', vel: 0.2 });
            if (fifthNote) {
                bassPattern.push({ time: '0:0:0', freq: fifthNote, dur: '4m', vel: 0.15 });
            }
            break;
        }

        default:
            break;
    }

    // Loop patterns to fill the 4m duration of the melody part
    const loopBassPattern = (pattern: NoteEvent[]): NoteEvent[] => {
        if (!pattern.length) return [];
        const looped = [];
        for(let i=0; i<4; i++){
            for(const note of pattern){
                const [m, b, s] = note.time.split(':').map(Number);
                const newMeasure = m + i;
                if(newMeasure < 4){
                    looped.push({...note, time: `${newMeasure}:${b}:${s}`});
                }
            }
        }
        return looped;
    };
    
    // The melody part is 4 measures, bass is 4 measures.
    // The logic inside each style should generate for the appropriate length.
    // We can assume bass loops every measure if it's shorter.
    const finalBassPattern = bassPattern.length > 0 && bassPattern[bassPattern.length - 1].time.startsWith('0:') 
        ? loopBassPattern(bassPattern)
        : bassPattern;

    return { bassPattern: finalBassPattern, melodyPattern };
}

    