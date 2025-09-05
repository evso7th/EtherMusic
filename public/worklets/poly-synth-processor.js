// public/worklets/poly-synth-processor.js

const SCALE_PRESETS = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
};

class PolyphonicSynthProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [];
    }

    constructor() {
        super();
        this.voices = [];
        this.voiceMap = new Map(); // Map pointerId to voice index
        this.latchMode = false;
        this.latchedNotes = new Map(); // Map frequency to voice index
        this.key = 'C';
        this.scale = 'Major Pentatonic';
        this.baseFrequency = 261.63; // C4
        this.scaleIntervals = SCALE_PRESETS[this.scale];

        this.updateHarmonics();

        this.port.onmessage = this.handleMessage.bind(this);

        // Initialize voices
        for (let i = 0; i < 8; i++) { // 8 voices for polyphony
            this.voices.push(this.createVoice());
        }
    }

    updateHarmonics() {
        const keyOffset = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 }[this.key];
        const rootMidi = 60 + keyOffset;
        this.scaleFrequencies = this.scaleIntervals.map(interval => this.midiToFreq(rootMidi + interval));
    }
    
    quantizeFrequency(freq) {
        if (!this.scaleFrequencies || this.scaleFrequencies.length === 0) return freq;

        let closestFreq = this.scaleFrequencies[0];
        let smallestDiff = Infinity;

        // Check across multiple octaves
        for (let octave = -3; octave <= 3; octave++) {
            for (const scaleFreq of this.scaleFrequencies) {
                const currentFreq = scaleFreq * Math.pow(2, octave);
                const diff = Math.abs(freq - currentFreq);
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    closestFreq = currentFreq;
                }
            }
        }
        return closestFreq;
    }


    handleMessage(event) {
        const { type, pointerId, frequency, volume, key, scale, isOn, instrument, part } = event.data;

        switch (type) {
            case 'noteOn':
                this.noteOn(pointerId, frequency, volume);
                break;
            case 'noteUpdate':
                this.noteUpdate(pointerId, frequency, volume);
                break;
            case 'noteOff':
                this.noteOff(pointerId);
                break;
            case 'setHarmony':
                this.key = key;
                this.scale = scale;
                this.scaleIntervals = SCALE_PRESETS[scale];
                this.updateHarmonics();
                break;
            case 'latch':
                this.latchMode = isOn;
                if (!isOn) {
                    // Turn off any latched notes when mode is disabled
                    this.latchedNotes.forEach((voiceIndex, freq) => {
                         if (this.voices[voiceIndex] && this.voices[voiceIndex].isLatched) {
                            this.voices[voiceIndex].targetGain = 0;
                            this.voices[voiceIndex].isLatched = false;
                        }
                    });
                    this.latchedNotes.clear();
                }
                break;
            case 'allNotesOff':
                this.voices.forEach(voice => {
                    voice.targetGain = 0;
                    voice.isActive = false;
                    voice.isLatched = false;
                });
                this.voiceMap.clear();
                this.latchedNotes.clear();
                break;
             case 'setInstrument':
                this.instrument = instrument; // e.g. 'synth', 'organ'
                break;
        }
    }

    createVoice() {
        return {
            isActive: false,
            isLatched: false,
            pointerId: null,
            frequency: 440,
            targetFrequency: 440,
            gain: 0,
            targetGain: 0,
            phase: 0,
            // Envelope
            attackTime: 0.01,
            releaseTime: 0.5,
            // Filter
            filterState: 0,
            filterCutoff: 0.1, // Simple lowpass
        };
    }

    getVoice(pointerId) {
        if (this.voiceMap.has(pointerId)) {
            return this.voices[this.voiceMap.get(pointerId)];
        }

        let voiceIndex = this.voices.findIndex(v => !v.isActive);
        if (voiceIndex === -1) {
            voiceIndex = 0; // Voice stealing
        }
        
        this.voiceMap.set(pointerId, voiceIndex);
        const voice = this.voices[voiceIndex];
        voice.pointerId = pointerId;
        return voice;
    }
    
    noteOn(pointerId, frequency, volume) {
        const quantizedFreq = this.quantizeFrequency(frequency);

        if (this.latchMode) {
            // Check if this note is already latched
            if (this.latchedNotes.has(quantizedFreq)) {
                const voiceIndex = this.latchedNotes.get(quantizedFreq);
                if (this.voices[voiceIndex]) {
                    this.voices[voiceIndex].targetGain = 0; // Turn it off
                    this.voices[voiceIndex].isLatched = false;
                }
                this.latchedNotes.delete(quantizedFreq);
            } else {
                 // Find a voice for the new latched note
                let voiceIndex = this.voices.findIndex(v => !v.isActive && !v.isLatched);
                if (voiceIndex === -1) voiceIndex = 0; // Voice stealing

                const voice = this.voices[voiceIndex];
                voice.isActive = true;
                voice.isLatched = true;
                voice.frequency = quantizedFreq;
                voice.targetFrequency = quantizedFreq;
                voice.targetGain = volume;
                voice.gain = 0; // Start from 0 for attack
                
                this.latchedNotes.set(quantizedFreq, voiceIndex);
            }
            return; // In latch mode, we don't use pointer tracking
        }


        const voice = this.getVoice(pointerId);
        voice.isActive = true;
        voice.isLatched = false;
        voice.frequency = quantizedFreq;
        voice.targetFrequency = quantizedFreq;
        voice.targetGain = volume;
        voice.gain = 0; // Start attack
    }

    noteUpdate(pointerId, frequency, volume) {
         if (this.latchMode) return;
        const voice = this.getVoice(pointerId);
        if (voice && voice.isActive) {
            voice.targetFrequency = this.quantizeFrequency(frequency);
            voice.targetGain = volume;
        }
    }

    noteOff(pointerId) {
         if (this.latchMode) return;
        if (this.voiceMap.has(pointerId)) {
            const voiceIndex = this.voiceMap.get(pointerId);
            const voice = this.voices[voiceIndex];
            if (voice) {
                voice.targetGain = 0; // Start release
            }
            this.voiceMap.delete(pointerId);
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const bufferSize = output[0].length;

        for (let i = 0; i < bufferSize; i++) {
            let mixedSample = 0;

            for (const voice of this.voices) {
                if (voice.isActive) {
                    // --- Envelope ---
                    const attackStep = 1 / (this.sampleRate * voice.attackTime);
                    const releaseStep = 1 / (this.sampleRate * voice.releaseTime);

                    if (voice.gain < voice.targetGain) {
                        voice.gain = Math.min(voice.targetGain, voice.gain + attackStep);
                    } else if (voice.gain > voice.targetGain) {
                        voice.gain = Math.max(voice.targetGain, voice.gain - releaseStep);
                    }
                    
                    // --- Glide (Portamento) ---
                    const freqDiff = voice.targetFrequency - voice.frequency;
                    // A simple glide, adjust factor for speed
                    voice.frequency += freqDiff * 0.05;


                    // --- Oscillator ---
                    const phaseIncrement = voice.frequency * 2 * Math.PI / this.sampleRate;
                    voice.phase += phaseIncrement;
                    if (voice.phase > 2 * Math.PI) voice.phase -= 2 * Math.PI;
                    
                    let sample = 0;
                    // Simple sine wave for now, can be expanded for different instruments
                    sample = Math.sin(voice.phase);

                    mixedSample += sample * voice.gain;

                    // Deactivate voice when gain is zero
                    if (voice.gain <= 0 && voice.targetGain <= 0) {
                        voice.isActive = false;
                        voice.isLatched = false;
                    }
                }
            }
            
            for (let channel = 0; channel < output.length; channel++) {
                output[channel][i] = mixedSample * 0.5; // Master volume
            }
        }

        return true;
    }
    
    midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
}

registerProcessor('poly-synth-processor', PolyphonicSynthProcessor);
