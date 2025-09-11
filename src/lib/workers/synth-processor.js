
// This script is designed to be loaded into an AudioWorklet.
// It is responsible for all real-time synthesis, running in a high-priority
// audio thread to ensure low-latency, glitch-free sound generation.

// A performance-optimized oscillator class.
class Oscillator {
    constructor(type, sampleRate) {
        this.phase = 0;
        this.type = type;
        this.sampleRate = sampleRate;
    }

    // Generates a single sample for a given frequency.
    process(frequency) {
        let sample = 0;
        const phaseIncrement = frequency / this.sampleRate;
        const p = this.phase;

        // Using Poly-BLEP (Polynomial Band-Limited Step) for anti-aliasing.
        // This method adds a small polynomial correction at the discontinuities
        // of square and sawtooth waves to reduce aliasing artifacts.
        switch (this.type) {
            case 'sine':
                sample = Math.sin(p * 2 * Math.PI);
                break;
            case 'square':
                sample = p < 0.5 ? 1 : -1;
                sample += this.poly_blep(p, phaseIncrement);
                sample -= this.poly_blep((p + 0.5) % 1.0, phaseIncrement);
                break;
            case 'sawtooth':
                sample = 2 * p - 1;
                sample -= this.poly_blep(p, phaseIncrement);
                break;
            case 'triangle':
                 // Integrated triangle wave from the sawtooth
                sample = 2 * p - 1;
                sample -= this.poly_blep(p, phaseIncrement);
                sample = phaseIncrement * sample + (1 - phaseIncrement) * this.lastOut;
                this.lastOut = sample;
                break;
            default:
                sample = Math.sin(p * 2 * Math.PI);
        }
        this.phase = (p + phaseIncrement) % 1.0;
        return sample;
    }

    // Polynomial Band-Limited Step function.
    poly_blep(t, dt) {
        if (t < dt) {
            t /= dt;
            return t + t - t * t - 1.0;
        } else if (t > 1.0 - dt) {
            t = (t - 1.0) / dt;
            return t * t + t + t + 1.0;
        }
        return 0.0;
    }
}


// A single synthesizer voice, encapsulating oscillators, envelopes, and filters.
class Voice {
    constructor(id, frequency, volume, preset, sampleRate) {
        this.id = id;
        this.sampleRate = sampleRate;
        this.isReleasing = false;
        this.isFinished = false;

        this.baseFrequency = frequency;
        this.targetFrequency = frequency;
        this.volume = volume;
        this.preset = preset;
        
        // Portamento: smooth transition between notes
        this.portamentoSpeed = preset.portamento > 0 ? 1 - Math.exp(-1 / (preset.portamento * this.sampleRate * 0.1)) : 1;

        this.layers = [];
        this.initLayers();
        this.initFilter();
        this.initLFO();
    }

    initLayers() {
        this.layers = [];
        const createLayer = (layerConfig, isMainOsc) => {
            const envConfig = isMainOsc ? this.preset.envelope : (layerConfig.envelope || this.preset.envelope);
            // Ensure envelope times are not zero to prevent division by zero
            const attackSamples = Math.max(1, (envConfig.attack || 0.001) * this.sampleRate);
            const releaseSamples = Math.max(1, (envConfig.release || 0.001) * this.sampleRate);
            const decaySamples = Math.max(1, (envConfig.decay || 0.001) * this.sampleRate);
            
            return {
                osc: new Oscillator(layerConfig.type || 'sine', this.sampleRate),
                level: layerConfig.level ?? 1.0,
                freqMult: layerConfig.freqMult || 1,
                detune: layerConfig.detune || 0,
                env: {
                    attackInc: 1.0 / attackSamples,
                    decayRate: envConfig.sustain < 1.0 ? Math.pow(envConfig.sustain, 1 / decaySamples) : 1.0,
                    releaseRate: Math.pow(0.0001, 1/releaseSamples),
                    sustainLevel: envConfig.sustain ?? 1.0,
                    state: 'attack',
                    currentValue: 0,
                },
            };
        };

        if (this.preset.oscillator) {
            this.layers.push(createLayer({ ...this.preset.oscillator, level: 1.0, freqMult: 1.0, envelope: this.preset.envelope }, true));
        }
        this.preset.layers?.forEach(layer => this.layers.push(createLayer(layer, false)));
    }

    initFilter() {
        const filterConfig = this.preset.filter;
        if (!filterConfig || filterConfig.frequency <= 0) {
            this.filter = null;
            return;
        }
        // Initialize filter state variables to prevent pops
        this.filter = { ...filterConfig, y1: 0, y2: 0, x1: 0, x2: 0 };
        this.updateFilterCoeffs();
    }

    updateFilterCoeffs() {
        if(!this.filter) return;
        const { type, Q, gain, frequency } = this.filter;
        const w0 = 2 * Math.PI * frequency / this.sampleRate;
        const cos_w0 = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * Math.max(0.001, Q)); // Prevent Q from being zero
        
        let a0=1, a1=0, a2=0, b0=1, b1=0, b2=0;

        switch (type) {
            case 'lowpass': b0 = (1 - cos_w0) / 2; b1 = 1 - cos_w0; b2 = (1 - cos_w0) / 2; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'peaking': const A = Math.pow(10, gain / 40); b0 = 1 + alpha * A; b1 = -2 * cos_w0; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos_w0; a2 = 1 - alpha / A; break;
            case 'highpass': b0 = (1 + cos_w0) / 2; b1 = -(1 + cos_w0); b2 = (1 + cos_w0) / 2; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'notch': b0 = 1; b1 = -2 * cos_w0; b2 = 1; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            default: this.filter.active = false; return;
        }

        // Pre-calculate coefficients divided by a0 for efficiency
        this.filter.b0=b0/a0; this.filter.b1=b1/a0; this.filter.b2=b2/a0; this.filter.a1=a1/a0; this.filter.a2=a2/a0;
        this.filter.active = true;
    }

    initLFO(vibrato) {
        if (!vibrato || vibrato.depth === 0) {
            this.lfo = null;
            return;
        }
        this.lfo = { phase: 0, inc: vibrato.frequency / this.sampleRate, depth: vibrato.depth };
    }
    
    processLFO() {
        if (!this.lfo) return 0;
        const lfoSample = Math.sin(this.lfo.phase * 2 * Math.PI) * this.lfo.depth;
        this.lfo.phase = (this.lfo.phase + this.lfo.inc) % 1.0;
        return lfoSample;
    }

    processFilter(inputSample) {
        if (!this.filter || !this.filter.active) return inputSample;
        const f = this.filter;
        
        // Direct Form I biquad filter implementation.
        const y0 = f.b0 * inputSample + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
        
        f.x2 = f.x1;
        f.x1 = inputSample;
        f.y2 = f.y1;
        f.y1 = y0;
        
        return isNaN(y0) ? 0 : y0; // Prevent NaN propagation
    }

    processLayerEnvelope(layer) {
        const env = layer.env;
        if (this.isReleasing && env.state !== 'release') {
            env.state = 'release';
        }

        switch (env.state) {
            case 'attack':
                env.currentValue += env.attackInc;
                if (env.currentValue >= 1.0) { env.currentValue = 1.0; env.state = 'decay'; }
                break;
            case 'decay':
                env.currentValue *= env.decayRate;
                if (env.currentValue <= env.sustainLevel) { env.currentValue = env.sustainLevel; env.state = 'sustain'; }
                break;
            case 'release':
                env.currentValue *= env.releaseRate;
                if (env.currentValue < 0.00001) { env.currentValue = 0; }
                break;
        }
        return env.currentValue;
    }

    render() {
        if (this.isFinished) return 0;

        if (this.isReleasing && this.layers.every(l => l.env.currentValue === 0)) {
            this.isFinished = true;
            return 0;
        }
        
        // Apply portamento glide
        this.baseFrequency = this.portamentoSpeed * this.baseFrequency + (1 - this.portamentoSpeed) * this.targetFrequency;

        const lfoModulation = this.processLFO();
        
        let mixedSample = 0;
        this.layers.forEach(layer => {
            const envelopeValue = this.processLayerEnvelope(layer);
            if (envelopeValue > 0) {
                 const detunedFreq = this.baseFrequency * Math.pow(2, layer.detune / 1200);
                 const modulatedFrequency = (detunedFreq * layer.freqMult) + lfoModulation;
                 const oscSample = layer.osc.process(modulatedFrequency);
                 mixedSample += oscSample * layer.level * envelopeValue;
            }
        });
        
        const filteredSample = this.processFilter(mixedSample);
        
        return filteredSample * this.volume;
    }

    noteUpdate(frequency, volume) { this.targetFrequency = frequency; this.volume = volume; }
    release() { if (!this.isReleasing) this.isReleasing = true; }
}

class SynthProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.voices = new Map();
        this.polyphony = options.processorOptions?.polyphony || 8;
        this.preset = this.getDefaultPreset();
        
        // -- For Debugging --
        this.logCounter = 0;
        this.peakLevel = 0;

        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, note, id, preset } = event.data;
        switch (type) {
            case 'noteOn':
                if (note) this.noteOn(note);
                break;
            case 'noteOff':
                if (id !== undefined) this.noteOff(id);
                break;
            case 'noteUpdate':
                if (note) this.noteUpdate(note);
                break;
            case 'allNotesOff':
                this.allNotesOff();
                break;
            case 'setPreset':
                if (preset) this.applyPreset(preset);
                break;
        }
    }

    applyPreset(preset) {
        this.preset = { ...this.getDefaultPreset(), ...preset };
        this.allNotesOff();
    }

    noteOn(note) {
        if (this.voices.has(note.id)) {
            const voice = this.voices.get(note.id);
            voice.noteUpdate(note.frequency, note.volume);
            return;
        }

        // Voice stealing: if polyphony is exceeded, remove the oldest voice.
        if (this.voices.size >= this.polyphony) {
            const oldestId = this.voices.keys().next().value;
            this.voices.delete(oldestId);
        }

        const voice = new Voice(note.id, note.frequency, note.volume, this.preset, sampleRate);
        this.voices.set(note.id, voice);
    }
    
    noteUpdate(note) {
        const voice = this.voices.get(note.id);
        if (voice) {
            voice.noteUpdate(note.frequency, note.volume);
        }
    }

    noteOff(id) {
        const voice = this.voices.get(id);
        if (voice) {
            voice.release();
        }
    }

    allNotesOff() {
        this.voices.forEach(voice => voice.release());
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        
        if (!outputChannel) {
            return true; // Stop processing if there's no output.
        }
    
        outputChannel.fill(0);
        
        const voiceCount = this.voices.size;
        if (voiceCount === 0) {
            return true; // No active voices, nothing to do.
        }

        let currentPeak = 0;
        
        for (let i = 0; i < outputChannel.length; i++) {
            let sample = 0;
            // Iterate over all active voices and sum their output.
            for (const [id, voice] of this.voices) {
                if (voice.isFinished) {
                    this.voices.delete(id); // Clean up finished voices.
                } else {
                    sample += voice.render();
                }
            }

            // Track the peak level for debugging.
            const absSample = Math.abs(sample);
            if (absSample > currentPeak) {
                currentPeak = absSample;
            }
            
            // Simple but effective soft-clipping to prevent harsh digital distortion.
            // This is a hard limiter that shapes the waveform instead of just cutting it off.
            outputChannel[i] = Math.tanh(sample * 0.5);
        }
        
        // Update peak level for logging.
        if (currentPeak > this.peakLevel) {
            this.peakLevel = currentPeak;
        }

        // Log active voices and peak level periodically for debugging.
        this.logCounter++;
        if (this.logCounter >= 200) { // Log roughly every 500ms
             if (this.voices.size > 0) {
                const activeFrequencies = Array.from(this.voices.values()).map(v => v.targetFrequency.toFixed(2));
                this.port.postMessage({
                    type: 'debug',
                    message: `Active voices: ${this.voices.size}. Frequencies: [${activeFrequencies.join(', ')}]. Peak level: ${this.peakLevel.toFixed(4)}`
                });
            }
            this.logCounter = 0;
            this.peakLevel = 0;
        }
        
        return true; // Keep the processor alive.
    }
    
    getDefaultPreset() {
        return {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.5 },
            filter: null,
            vibrato: null,
            layers: [],
            portamento: 0
        };
    }
}

registerProcessor('synth-processor', SynthProcessor);
