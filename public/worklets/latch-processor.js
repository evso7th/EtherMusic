
class Voice {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.phase = 0;
        this.frequency = 440;
        this.gain = 0;
        this.targetGain = 0;
        this.portamentoTime = 0; // in seconds
        this.portamentoStep = 0;

        this.oscillator = 'sine';
        this.envelope = {
            attack: 0.1,
            decay: 0.1,
            sustain: 1.0,
            release: 0.5,
        };
        this.filter = {
            type: 'lowpass',
            frequency: 20000,
            q: 1,
            output: 0,
            lp: 0,
            bp: 0
        };
        this.distortion = 0; // 0-100
        this.layers = [];
        this.stagger = 0;
    }

    setPreset(preset) {
        if (!preset) return;
        this.oscillator = preset.oscillator?.type || 'sine';
        this.envelope = { ...this.envelope, ...preset.envelope };
        this.filter = { ...this.filter, ...preset.filter };
        this.portamentoTime = preset.portamento || 0;
        this.distortion = preset.distortion || 0;
        this.layers = (preset.layers || []).map(layer => new Layer(layer, this.sampleRate));
        this.stagger = preset.stagger || 0;
    }

    noteOn(note) {
        if (this.portamentoTime > 0) {
            const freqStep = note.frequency - this.frequency;
            this.portamentoStep = freqStep / (this.sampleRate * this.portamentoTime);
        } else {
            this.frequency = note.frequency;
        }

        this.targetGain = note.volume;

        this.layers.forEach((layer, i) => {
            setTimeout(() => {
                layer.noteOn(note);
            }, (i + 1) * this.stagger * 1000);
        });
    }

    noteOff() {
        this.targetGain = 0;
        this.layers.forEach(layer => layer.noteOff());
    }

    update(note) {
         if (this.portamentoTime > 0) {
            const freqStep = note.frequency - this.frequency;
            this.portamentoStep = freqStep / (this.sampleRate * this.portamentoTime);
        } else {
            this.frequency = note.frequency;
        }
        this.targetGain = note.volume;
        
        this.layers.forEach(layer => layer.update(note));
    }
    
    isActive() {
        return this.gain > 0.001 || this.targetGain > 0.001 || this.layers.some(l => l.isActive());
    }
    
    // Process a single sample
    process() {
        // --- Gain Envelope ---
        const attackRate = 1 / (this.envelope.attack * this.sampleRate);
        const releaseRate = 1 / (this.envelope.release * this.sampleRate);
        
        if (this.gain < this.targetGain) {
            this.gain = Math.min(this.gain + attackRate, this.targetGain);
        } else if (this.gain > this.targetGain) {
            this.gain = Math.max(this.gain - releaseRate, 0);
        }
        
        // --- Portamento ---
        if (this.portamentoStep !== 0) {
            this.frequency += this.portamentoStep;
            // check if we reached the target
            if ((this.portamentoStep > 0 && this.frequency >= this.targetFrequency) ||
                (this.portamentoStep < 0 && this.frequency <= this.targetFrequency)) {
                this.frequency = this.targetFrequency;
                this.portamentoStep = 0;
            }
        }
        
        // --- Oscillator ---
        let sample = this.generateSample(this.oscillator, this.phase);

        this.phase += (this.frequency / this.sampleRate) * 2 * Math.PI;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;

        // --- Layers ---
        this.layers.forEach(layer => {
            sample += layer.process(this.frequency);
        });
        
        // --- Filter ---
        const f = this.filter.frequency / (this.sampleRate / 2);
        const res = this.filter.q;
        
        this.filter.lp += this.filter.bp * f;
        this.filter.bp += (sample - this.filter.lp - this.filter.bp * res) * f;
        
        let filteredSample;
        switch(this.filter.type) {
            case 'lowpass': filteredSample = this.filter.lp; break;
            case 'highpass': filteredSample = sample - this.filter.lp; break;
            case 'bandpass': filteredSample = this.filter.bp; break;
            default: filteredSample = sample;
        }

        // --- Final Gain ---
        return filteredSample * this.gain;
    }

    generateSample(type, phase) {
        switch (type) {
            case 'sine': return Math.sin(phase);
            case 'square': return Math.sign(Math.sin(phase));
            case 'sawtooth': return (phase / Math.PI) - 1;
            case 'triangle': return Math.asin(Math.sin(phase)) * (2 / Math.PI);
            default: return Math.sin(phase);
        }
    }
}

class Layer extends Voice {
     constructor(preset, sampleRate) {
        super(sampleRate);
        this.oscillator = preset.oscillator?.type || 'sine';
        this.envelope = { ...this.envelope, ...preset.envelope };
    }

    process(baseFrequency) {
        this.frequency = baseFrequency; // Layers follow the base frequency
        return super.process();
    }
}


class LatchProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        const { processorOptions } = options;
        
        this.voices = Array(processorOptions.polyphony).fill(null).map(() => new Voice(processorOptions.sampleRate));
        this.activeNotes = new Map(); // Map from note ID to voice index

        this.port.onmessage = (event) => {
            const { type, note, preset, id } = event.data;
            switch (type) {
                case 'noteOn':
                    this.noteOn(note);
                    break;
                case 'noteOff':
                    this.noteOff(id);
                    break;
                case 'noteUpdate': // Latch processor doesn't really update, but we'll handle it
                    // Find the voice for this note ID and update it if it exists
                    if (this.activeNotes.has(note.id)) {
                        const voiceIndex = this.activeNotes.get(note.id);
                        this.voices[voiceIndex].update(note);
                    }
                    break;
                case 'setPreset':
                    this.voices.forEach(voice => voice.setPreset(preset));
                    break;
                case 'allNotesOff':
                    this.allNotesOff();
                    break;
                case 'setDistortion':
                     this.voices.forEach(voice => voice.setDistortion(event.data.amount));
                     break;
            }
        };
    }

    noteOn(note) {
        let voiceIndex = -1;
        // Find a free voice
        for (let i = 0; i < this.voices.length; i++) {
            if (!this.voices[i].isActive()) {
                voiceIndex = i;
                break;
            }
        }
        if (voiceIndex === -1) {
            // No free voices, maybe steal the oldest one? For now, we'll just log.
            console.warn("[LatchProcessor] No free voices for new note.");
            return;
        }

        this.activeNotes.set(note.id, voiceIndex);
        this.voices[voiceIndex].noteOn(note);
    }

    noteOff(id) {
        if (this.activeNotes.has(id)) {
            const voiceIndex = this.activeNotes.get(id);
            this.voices[voiceIndex].noteOff();
            this.activeNotes.delete(id);
        }
    }
    
    allNotesOff() {
        this.voices.forEach(voice => voice.noteOff());
        this.activeNotes.clear();
    }
    
    setDistortion(amount) {
        this.voices.forEach(voice => {
            const drive = 1.0 + (amount / 100) * 99;
            voice.distortion = drive;
        });
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const outputChannel = output[0];

        for (let i = 0; i < outputChannel.length; i++) {
            let sample = 0;
            for (const voice of this.voices) {
                if (voice.isActive()) {
                    sample += voice.process();
                }
            }
            // Apply distortion if any voice has it
            for (const voice of this.voices) {
                if(voice.distortion > 1.0){
                    const k = voice.distortion;
                    const wetSample = (Math.PI + k) * sample * (1 / (Math.PI + k * Math.abs(sample)));
                    const mix = (k-1)/99.0;
                    sample = (wetSample*mix) + (sample*(1-mix));
                }
            }


            outputChannel[i] = sample / this.voices.length; // Basic mixdown
        }

        return true;
    }
}

registerProcessor('latch-processor', LatchProcessor);
