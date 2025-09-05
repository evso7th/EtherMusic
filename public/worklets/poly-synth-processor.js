// public/worklets/poly-synth-processor.js

const MAX_VOICES = 16;

// A simple quantizer to snap frequencies to a musical scale
class Quantizer {
    constructor() {
        this.scaleFrequencies = [];
    }

    setHarmony(key, scale) {
        // This is a simplified version. A real implementation would be more complex.
        const notes = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
        const scales = {
            'Major': [0, 2, 4, 5, 7, 9, 11],
            'Minor': [0, 2, 3, 5, 7, 8, 10],
            'Major Pentatonic': [0, 2, 4, 7, 9],
            'Minor Pentatonic': [0, 3, 5, 7, 10],
        };
        const rootNote = notes[key];
        const scaleIntervals = scales[scale];
        this.scaleFrequencies = [];
        for (let octave = 2; octave < 7; octave++) {
            for (const interval of scaleIntervals) {
                const noteNumber = rootNote + interval + (octave * 12);
                this.scaleFrequencies.push(440 * Math.pow(2, (noteNumber - 69) / 12));
            }
        }
    }

    quantize(frequency) {
        if (this.scaleFrequencies.length === 0) return frequency;
        let closestFreq = this.scaleFrequencies[0];
        let minDiff = Infinity;
        for (const scaleFreq of this.scaleFrequencies) {
            const diff = Math.abs(frequency - scaleFreq);
            if (diff < minDiff) {
                minDiff = diff;
                closestFreq = scaleFreq;
            }
        }
        return closestFreq;
    }
}


class PolySynthProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.voices = [];
        this.quantizer = new Quantizer();
        this.instrument = 'synth';
        this.isLatchOn = false;

        for (let i = 0; i < MAX_VOICES; i++) {
            this.voices.push({
                isActive: false,
                pointerId: -1,
                phase: 0,
                frequency: 440,
                targetFrequency: 440,
                gain: 0,
                targetGain: 0,
                attack: 0.01,
                release: 0.5,
                glideActive: false,
                glideProgress: 0,
                glideTime: 0.2,
                vibratoEnabled: false,
                vibratoRate: 5,
                vibratoDepth: 2,
                filterState: 0,
                type: 'sine',
            });
        }

        this.port.onmessage = (event) => this.handleMessage(event.data);
    }

    handleMessage(message) {
        const { type, pointerId, frequency, volume, key, scale, instrument, isOn, notes, options } = message;

        if (type === 'noteOn') {
            this.noteOn(pointerId, frequency, volume, options);
        } else if (type === 'noteUpdate') {
            this.noteUpdate(pointerId, frequency, volume);
        } else if (type === 'noteOff') {
            this.noteOff(pointerId);
        } else if (type === 'setHarmony') {
            this.quantizer.setHarmony(key, scale);
        } else if (type === 'setInstrument') {
            this.setInstrument(instrument);
        } else if (type === 'allNotesOff') {
            this.allNotesOff();
        } else if (type === 'latch') {
            this.isLatchOn = isOn;
            if (!isOn) {
                this.allNotesOff();
            }
        } else if (type === 'noteSlide') { // Portamento
            this.portamento(notes[0], notes[1], options?.glideTime);
        } else if (type === 'glissando') {
            this.glissando(notes[0], notes[1], options?.duration);
        }
    }

    setInstrument(instrument) {
        this.instrument = instrument;
        this.voices.forEach(voice => {
            switch (instrument) {
                case 'synth':
                    voice.type = 'sawtooth'; voice.attack = 0.01; voice.release = 0.5;
                    break;
                case 'organ':
                    voice.type = 'triangle'; voice.attack = 0.05; voice.release = 0.2;
                    break;
                case 'theremin':
                    voice.type = 'sine'; voice.attack = 0.1; voice.release = 1.0;
                    break;
                // Add other instruments
                default:
                    voice.type = 'sine'; voice.attack = 0.01; voice.release = 0.5;
            }
        });
    }

    findVoice(pointerId) {
        return this.voices.find(v => v.pointerId === pointerId && v.isActive);
    }

    getInactiveVoice() {
        return this.voices.find(v => !v.isActive);
    }

    noteOn(pointerId, frequency, volume, options = {}) {
        if (this.isLatchOn) {
            const existingVoice = this.findVoice(pointerId);
            if (existingVoice) {
                this.noteOff(pointerId);
                return;
            }
        }

        let voice = this.isLatchOn ? null : this.findVoice(pointerId);
        if (!voice) {
            voice = this.getInactiveVoice();
        }

        if (voice) {
            voice.isActive = true;
            voice.pointerId = pointerId;
            voice.frequency = this.quantizer.quantize(frequency);
            voice.targetFrequency = voice.frequency;
            voice.targetGain = volume;
            voice.gain = 0; // Start gain from 0 for attack
            voice.phase = 0;
            voice.glideActive = false;
            
            // Handle options
            voice.vibratoEnabled = !!options.vibrato;
            voice.vibratoRate = options.vibratoRate || 5;
            voice.vibratoDepth = options.vibratoDepth || 2;
        }
    }
    
    noteUpdate(pointerId, frequency, volume) {
        const voice = this.findVoice(pointerId);
        if (voice) {
            voice.targetFrequency = this.quantizer.quantize(frequency);
            voice.glideActive = true;
            voice.glideProgress = 0;
            if(volume !== undefined) {
                 voice.targetGain = volume;
            }
        }
    }

    noteOff(pointerId) {
        const voice = this.findVoice(pointerId);
        if (voice) {
            voice.targetGain = 0; // Start release phase
        }
    }
    
    allNotesOff() {
        this.voices.forEach(voice => {
            voice.targetGain = 0;
        });
    }

    portamento(fromMidi, toMidi, glideTime = 0.2) {
        const fromFreq = this.midiToFreq(fromMidi);
        const toFreq = this.midiToFreq(toMidi);

        let voice = this.getInactiveVoice();
        if (voice) {
            voice.isActive = true;
            voice.pointerId = fromMidi; // Use MIDI note as a temporary ID
            voice.frequency = fromFreq;
            voice.targetFrequency = toFreq;
            voice.targetGain = 0.7;
            voice.gain = 0.7; // Start at full volume
            voice.phase = 0;
            voice.glideActive = true;
            voice.glideProgress = 0;
            voice.glideTime = glideTime;
            
            // Deactivate after glide + release
            setTimeout(() => {
                voice.targetGain = 0;
            }, (glideTime + voice.release) * 1000);
        }
    }
    
    glissando(startMidi, endMidi, duration) {
        const steps = Math.abs(endMidi - startMidi);
        if (steps === 0) return;
        const stepTime = duration / steps;
        const direction = Math.sign(endMidi - startMidi);

        let currentMidi = startMidi;
        const intervalId = setInterval(() => {
            if (currentMidi === endMidi) {
                clearInterval(intervalId);
                return;
            }
            const freq = this.midiToFreq(currentMidi);
            let voice = this.getInactiveVoice();
            if (voice) {
                voice.isActive = true;
                voice.pointerId = -Date.now(); // Unique ID for transient notes
                voice.frequency = freq;
                voice.targetFrequency = freq;
                voice.gain = 0;
                voice.targetGain = 0.5;
                voice.release = stepTime * 1.5; // Let it ring a bit
                
                // Trigger release
                 setTimeout(() => {
                    if (voice) voice.targetGain = 0;
                }, stepTime * 1000);
            }
            currentMidi += direction;
        }, stepTime * 1000);
    }
    
    semitonesToRatio(semitones) {
        return Math.pow(2, semitones / 12);
    }
    
    midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const bufferSize = output[0].length;

        for (let i = 0; i < bufferSize; i++) {
            let mixedSample = 0;

            for (const voice of this.voices) {
                if (!voice.isActive && voice.gain <= 0.001) continue;

                // --- Envelope ---
                if (voice.gain < voice.targetGain) {
                    voice.gain += (1 / (voice.attack * sampleRate)); // Attack
                    if (voice.gain > voice.targetGain) voice.gain = voice.targetGain;
                } else if (voice.gain > voice.targetGain) {
                    voice.gain -= (1 / (voice.release * sampleRate)); // Release
                    if (voice.gain < 0) voice.gain = 0;
                }
                
                if (voice.gain === 0) {
                    voice.isActive = false;
                    continue;
                }

                // --- Glide (Portamento) ---
                if (voice.glideActive && voice.frequency !== voice.targetFrequency) {
                    const glideFactor = 1 / (sampleRate * voice.glideTime);
                    voice.frequency += (voice.targetFrequency - voice.frequency) * glideFactor * 10; // *10 to make it faster
                    if (Math.abs(voice.frequency - voice.targetFrequency) < 0.1) {
                        voice.frequency = voice.targetFrequency;
                        voice.glideActive = false;
                    }
                }

                // --- Vibrato LFO ---
                let vibratoOffset = 1.0;
                if (voice.vibratoEnabled) {
                    const vibratoPhaseIncrement = (2 * Math.PI * voice.vibratoRate) / sampleRate;
                    vibratoOffset = 1.0 + (Math.sin(this.currentTime * 2 * Math.PI * voice.vibratoRate) * voice.vibratoDepth) / 100;
                }

                // --- Oscillator ---
                const phaseIncrement = (voice.frequency * vibratoOffset) / sampleRate;
                voice.phase += phaseIncrement;
                if (voice.phase > 1) voice.phase -= 1;
                
                let sample = 0;
                const p = voice.phase * 2 * Math.PI;
                if (voice.type === 'sine') {
                    sample = Math.sin(p);
                } else if (voice.type === 'sawtooth') {
                    sample = (voice.phase * 2) - 1;
                } else if (voice.type === 'square') {
                    sample = voice.phase < 0.5 ? 1 : -1;
                } else if (voice.type === 'triangle') {
                    sample = 1 - 4 * Math.abs(Math.round(voice.phase - 0.25) - (voice.phase - 0.25));
                }

                // --- Low-pass Filter (simple) ---
                voice.filterState += (sample - voice.filterState) * 0.25; 
                sample = voice.filterState;

                mixedSample += sample * voice.gain * voice.gain; // Apply gain squared for perceptual loudness
            }
            
            output[0][i] = mixedSample * 0.5; // Mixdown with some headroom
            output[1][i] = mixedSample * 0.5; // Copy to right channel
        }
        
        return true;
    }
}

registerProcessor('poly-synth-processor', PolySynthProcessor);
