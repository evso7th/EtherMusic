
// A polyphonic synthesizer processor using AudioWorklet
// Manages multiple voice instances to play chords or multiple notes.

const MAX_VOICES = 8; // Max concurrent notes

// --- Music Theory / Math Helpers ---
const NOTES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const SCALES = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};
const ROOT_NOTE_MIDI = 60; // C4

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
}

function getScaleFrequencies(baseMidi, scaleIntervals, octaves = 3, startOctave = -1) {
    const freqs = [];
    for (let o = 0; o < octaves; o++) {
        for (const interval of scaleIntervals) {
            const midi = baseMidi + (startOctave + o) * 12 + interval;
            freqs.push(midiToFreq(midi));
        }
    }
    return freqs.sort((a, b) => a - b);
}

function quantizeFrequency(freq, scaleFreqs) {
    if (!scaleFreqs || scaleFreqs.length === 0) {
        return freq;
    }
    // Find the closest frequency in the scale
    return scaleFreqs.reduce((prev, curr) => 
        (Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev)
    );
}


// --- Voice Class ---
// Represents a single sound-producing unit (oscillator + envelope)
class Voice {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.isActive = false;
        this.pointerId = -1;

        // Oscillator
        this.phase = 0;
        this.frequency = 440;
        this.waveType = 'sine'; // 'sine', 'square', 'sawtooth', 'triangle'
        
        // Envelope
        this.envelope = {
            attack: 0.01,
            decay: 0.1,
            sustain: 0.9,
            release: 0.5,
            level: 0,
            state: 'idle', // idle, attack, decay, sustain, release
        };
        
        // Filter
        this.filter = {
            lpf: { cutoff: 20000, resonance: 1, state: 0 },
            hpf: { cutoff: 20, resonance: 1, state: 0 },
        };
        this.filterType = 'none'; // 'none', 'lowpass', 'highpass'

        // Glide/Portamento
        this.glideTime = 0;
        this.targetFrequency = 440;
        
        // Vibrato
        this.vibrato = {
            rate: 5, // Hz
            depth: 3, // Semitones
            phase: 0,
        };
    }

    start(pointerId, frequency, volume) {
        this.pointerId = pointerId;
        this.frequency = frequency;
        this.targetFrequency = frequency;
        this.envelope.level = 0;
        this.envelope.state = 'attack';
        this.envelope.targetGain = volume;
        this.isActive = true;
    }

    update(frequency, volume) {
        if (this.glideTime > 0) {
            this.targetFrequency = frequency;
        } else {
            this.frequency = frequency;
            this.targetFrequency = frequency;
        }
        this.envelope.targetGain = volume;
    }

    release() {
        this.envelope.state = 'release';
    }

    // Process one sample
    process() {
        if (!this.isActive) return 0;
        
        // --- Envelope ---
        const { attack, decay, sustain, release } = this.envelope;
        const sampleRate = this.sampleRate;

        switch (this.envelope.state) {
            case 'attack':
                this.envelope.level += 1.0 / (attack * sampleRate);
                if (this.envelope.level >= 1.0) {
                    this.envelope.level = 1.0;
                    this.envelope.state = 'decay';
                }
                break;
            case 'decay':
                 this.envelope.level -= (1.0 - sustain) / (decay * sampleRate);
                 if (this.envelope.level <= sustain) {
                     this.envelope.level = sustain;
                     this.envelope.state = 'sustain';
                 }
                 break;
            case 'sustain':
                // Sustain level can be modulated by volume
                this.envelope.level = sustain * this.envelope.targetGain;
                break;
            case 'release':
                this.envelope.level -= this.envelope.level / (release * sampleRate);
                if (this.envelope.level <= 0.0001) {
                    this.isActive = false;
                }
                break;
        }
        
        // --- Glide ---
        if (this.glideTime > 0 && this.frequency !== this.targetFrequency) {
            const glideFactor = 1.0 / (this.glideTime * sampleRate);
            this.frequency += (this.targetFrequency - this.frequency) * glideFactor;
        }

        // --- Oscillator ---
        let sample = 0;
        const phaseIncrement = (2 * Math.PI * this.frequency) / sampleRate;
        this.phase += phaseIncrement;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;

        switch(this.waveType) {
            case 'sine':
                sample = Math.sin(this.phase);
                break;
            case 'square':
                sample = Math.sign(Math.sin(this.phase));
                break;
            case 'sawtooth':
                sample = (this.phase / Math.PI) - 1;
                break;
            case 'triangle':
                sample = Math.abs((this.phase / Math.PI) - 1) * 2 - 1;
                break;
        }
        
        // --- Filter (Simple LPF for now) ---
        if (this.filterType === 'lowpass') {
             const cutoff = this.filter.lpf.cutoff / (sampleRate / 2);
             this.filter.lpf.state += cutoff * (sample - this.filter.lpf.state);
             sample = this.filter.lpf.state;
        }
        
        return sample * this.envelope.level;
    }
}


// --- Main Processor ---
class PolySynthProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const polyphony = options?.processorOptions?.polyphony ?? MAX_VOICES;
        this.voices = Array.from({ length: polyphony }, () => new Voice(sampleRate));
        this.activeVoices = new Map(); // pointerId -> voiceIndex
        this.isLatchOn = false;
        
        this.scaleFrequencies = [];
        this.musicKey = 'G';
        this.musicScale = 'Major';
        this.updateHarmony();

        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, ...data } = event.data;
        switch (type) {
            case 'noteOn':
                this.noteOn(data.pointerId, data.frequency, data.volume);
                break;
            case 'noteUpdate':
                this.noteUpdate(data.pointerId, data.frequency, data.volume);
                break;
            case 'noteOff':
                this.noteOff(data.pointerId);
                break;
            case 'allNotesOff':
                this.allNotesOff();
                break;
            case 'setInstrument':
                this.setInstrument(data.instrument);
                break;
            case 'setHarmony':
                this.musicKey = data.key;
                this.musicScale = data.scale;
                this.updateHarmony();
                break;
            case 'latch':
                this.isLatchOn = data.isOn;
                if (!this.isLatchOn) {
                    this.allNotesOff();
                }
                break;
        }
    }

    setInstrument(instrument) {
        const waveTypeMap = {
            'synth': 'sawtooth',
            'organ': 'triangle',
            'theremin': 'sine',
            'ebass': 'square',
            'E-Bells': 'sine',
            'mellotron': 'sawtooth',
            'G-Drops': 'triangle',
            'autopilot_effect_star': 'sine',
            'autopilot_effect_meteor': 'sawtooth',
            'autopilot_effect_bell': 'sine',
            'autopilot_effect_chimes': 'triangle'
        };

        const filterTypeMap = {
            'synth': 'lowpass',
            'ebass': 'lowpass'
        };

        const glideMap = {
            'theremin': 0.05
        }
        
        const releaseMap = {
            'G-Drops': 1.5,
            'E-Bells': 2.0,
            'mellotron': 1.0,
            'autopilot_effect_star': 2.0,
            'autopilot_effect_meteor': 1.0,
            'autopilot_effect_bell': 3.0,
            'autopilot_effect_chimes': 4.0
        }

        this.voices.forEach(voice => {
            voice.waveType = waveTypeMap[instrument] || 'sine';
            voice.filterType = filterTypeMap[instrument] || 'none';
            voice.glideTime = glideMap[instrument] || 0;
            voice.envelope.release = releaseMap[instrument] || 0.5;
        });
    }

    updateHarmony() {
        const baseMidi = NOTES[this.musicKey];
        const intervals = SCALES[this.musicScale];
        this.scaleFrequencies = getScaleFrequencies(baseMidi, intervals, 5, -2);
    }
    
    findFreeVoice() {
        // Find the first inactive voice
        for (let i = 0; i < this.voices.length; i++) {
            if (!this.voices[i].isActive) {
                return { voice: this.voices[i], index: i };
            }
        }
        // If all are active, steal the oldest one (simple strategy)
        return { voice: this.voices[0], index: 0 }; 
    }

    noteOn(pointerId, frequency, volume) {
        if (this.isLatchOn) {
             // In latch mode, a new note might turn off an existing one at the same pitch
            const quantizedFreq = quantizeFrequency(frequency, this.scaleFrequencies);
            for(const [pid, voiceIndex] of this.activeVoices.entries()) {
                if (this.voices[voiceIndex].frequency === quantizedFreq) {
                    this.noteOff(pid);
                    return; // Toggle off, don't start a new note.
                }
            }
        }
        
        // If we already have a note for this pointer, just update it.
        // This handles cases like sliding a finger into the pad.
        if (this.activeVoices.has(pointerId)) {
            this.noteUpdate(pointerId, frequency, volume);
            return;
        }

        const { voice, index } = this.findFreeVoice();
        if (voice) {
            const quantizedFreq = quantizeFrequency(frequency, this.scaleFrequencies);
            voice.start(pointerId, quantizedFreq, volume);
            this.activeVoices.set(pointerId, index);
        }
    }

    noteUpdate(pointerId, frequency, volume) {
        const voiceIndex = this.activeVoices.get(pointerId);
        if (voiceIndex !== undefined) {
            const voice = this.voices[voiceIndex];
            const quantizedFreq = quantizeFrequency(frequency, this.scaleFrequencies);
            voice.update(quantizedFreq, volume);
        }
    }

    noteOff(pointerId) {
        const voiceIndex = this.activeVoices.get(pointerId);
        if (voiceIndex !== undefined) {
            this.voices[voiceIndex].release();
            this.activeVoices.delete(pointerId);
        }
    }
    
    allNotesOff() {
        this.voices.forEach(voice => voice.release());
        this.activeVoices.clear();
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        for (let i = 0; i < output[0].length; i++) {
            let sample = 0;
            for (const voice of this.voices) {
                sample += voice.process();
            }

            // Simple limiter to prevent clipping
            sample = Math.tanh(sample);

            for (let channel = 0; channel < channelCount; channel++) {
                output[channel][i] = sample / this.voices.length; // Mixdown
            }
        }
        
        // Keep the processor alive
        return true;
    }
}

registerProcessor('poly-synth-processor', PolySynthProcessor);
