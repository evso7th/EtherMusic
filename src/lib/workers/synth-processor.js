

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

    process(frequency) {
        let sample = 0;
        const phaseIncrement = frequency / this.sampleRate;
        const p = this.phase;

        // Using Poly-BLEP (Polynomial Band-Limited Step) for anti-aliasing
        // This significantly reduces high-frequency artifacts ("aliasing") for
        // waveforms with sharp edges, like square and sawtooth.
        switch (this.type) {
            case 'sine':
                sample = Math.sin(p * 2 * Math.PI);
                break;
            case 'square':
                sample = p < 0.5 ? 1 : -1;
                // Poly-BLEP correction at discontinuities (0 and 0.5)
                let t = p / phaseIncrement;
                if (p < phaseIncrement) sample += t + t - t * t - 1.0;
                t = (p - 0.5) / phaseIncrement;
                if (p >= 0.5 && p < 0.5 + phaseIncrement) sample -= t + t - t * t - 1.0;
                break;
            case 'sawtooth':
                sample = 2 * p - 1;
                 // Poly-BLEP correction at the discontinuity (wrap-around)
                if (p < phaseIncrement) {
                    let t = p / phaseIncrement;
                    sample -= t + t - t * t - 1.0;
                }
                break;
            case 'triangle':
                // A more direct way to calculate triangle wave
                sample = 2 * (p < 0.5 ? p : 1 - p) * 2 - 1;
                break;
            default:
                sample = Math.sin(p * 2 * Math.PI);
        }
        this.phase = (p + phaseIncrement) % 1;
        return sample;
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
        
        // Optimized portamento calculation
        this.portamentoSpeed = preset.portamento > 0 ? 1 - Math.exp(-1 / (preset.portamento * this.sampleRate * 0.1)) : 1;

        this.layers = [];
        this.initLayers();
        this.initFilter();
        this.initLFO();
    }

    initLayers() {
        const createLayer = (layerConfig, baseFreq, isMainOsc) => {
            const envConfig = isMainOsc ? this.preset.envelope : (layerConfig.envelope || this.preset.envelope);
            const attackSamples = Math.max(1, (envConfig.attack || 0.01) * this.sampleRate);
            
            return {
                osc: new Oscillator(layerConfig.type || 'sine', this.sampleRate),
                level: layerConfig.level ?? 1.0,
                freqMult: layerConfig.freqMult || 1,
                detune: layerConfig.detune || 0,
                env: {
                    attackInc: 1.0 / attackSamples,
                    decayRate: envConfig.decay > 0 ? (1.0 - (envConfig.sustain ?? 1.0)) / (envConfig.decay * this.sampleRate) : 1,
                    releaseRate: envConfig.release > 0 ? (envConfig.sustainLevel ?? envConfig.sustain ?? 1.0) / (envConfig.release * this.sampleRate) : 1,
                    sustainLevel: envConfig.sustain ?? 1.0,
                    state: 'attack',
                    currentValue: 0,
                    releaseStartValue: 0,
                },
            };
        };

        if (this.preset.oscillator) {
            const mainOscConfig = { ...this.preset.oscillator, level: 1.0, freqMult: 1.0, envelope: this.preset.envelope };
            this.layers.push(createLayer(mainOscConfig, this.baseFrequency, true));
        }

        if (this.preset.layers) {
            this.preset.layers.forEach(layer => this.layers.push(createLayer(layer, this.baseFrequency, false)));
        }
    }

    initFilter() {
        const filterConfig = this.preset.filter;
        if (!filterConfig || filterConfig.frequency <= 0) {
            this.filter = null;
            return;
        }
        this.filter = { ...filterConfig, x1: 0, x2: 0, y1: 0, y2: 0 };
        this.updateFilterCoeffs();
    }

    updateFilterCoeffs() {
        if(!this.filter) return;
        const { type, Q, gain, frequency } = this.filter;
        const w0 = 2 * Math.PI * frequency / this.sampleRate;
        const cos_w0 = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * Q);
        
        let a0=1, a1=0, a2=0, b0=1, b1=0, b2=0;

        switch (type) {
            case 'lowpass': b0 = (1 - cos_w0) / 2; b1 = 1 - cos_w0; b2 = (1 - cos_w0) / 2; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'peaking': const A = Math.pow(10, gain / 40); b0 = 1 + alpha * A; b1 = -2 * cos_w0; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos_w0; a2 = 1 - alpha / A; break;
            case 'highpass': b0 = (1 + cos_w0) / 2; b1 = -(1 + cos_w0); b2 = (1 + cos_w0) / 2; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'notch': b0 = 1; b1 = -2 * cos_w0; b2 = 1; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
        }
        this.filter.a0=a0; this.filter.a1=a1; this.filter.a2=a2; this.filter.b0=b0; this.filter.b1=b1; this.filter.b2=b2;
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
        if (!this.filter) return inputSample;
        const f = this.filter;
        // This is a direct form II transposed biquad filter implementation.
        // It's computationally efficient for real-time audio processing.
        const outputSample = (f.b0/f.a0) * inputSample + f.x1;
        f.x1 = (f.b1/f.a0) * inputSample - (f.a1/f.a0) * outputSample + f.x2;
        f.x2 = (f.b2/f.a0) * inputSample - (f.a2/f.a0) * outputSample;
        return outputSample;
    }

    processLayerEnvelope(layer) {
        const env = layer.env;
        if (this.isReleasing && env.state !== 'release') {
            env.state = 'release';
            env.releaseStartValue = env.currentValue;
            env.releaseRate = env.currentValue / Math.max(1, this.preset.envelope.release * this.sampleRate);
        }

        switch (env.state) {
            case 'attack':
                env.currentValue += env.attackInc;
                if (env.currentValue >= 1.0) { env.currentValue = 1.0; env.state = 'decay'; }
                break;
            case 'decay':
                env.currentValue -= env.decayRate;
                if (env.currentValue <= env.sustainLevel) { env.currentValue = env.sustainLevel; env.state = 'sustain'; }
                break;
            case 'release':
                env.currentValue -= env.releaseRate;
                if (env.currentValue <= 0) { env.currentValue = 0; }
                break;
        }
        return env.currentValue;
    }

    render() {
        if (this.isFinished) return 0;
        
        if (this.isReleasing && this.layers.every(l => l.env.currentValue <= 0.0001)) {
            this.isFinished = true;
            return 0;
        }
        
        // Glide to the target frequency
        this.baseFrequency += (this.targetFrequency - this.baseFrequency) * this.portamentoSpeed;

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

        if (this.voices.size >= this.polyphony) {
            let oldestId = this.voices.keys().next().value;
            let oldestVoice = this.voices.get(oldestId);
            let foundReleasing = oldestVoice?.isReleasing;

            if (!foundReleasing) {
                for (const [id, voice] of this.voices.entries()) {
                    if (voice.isReleasing) {
                        oldestId = id;
                        foundReleasing = true;
                        break;
                    }
                }
            }
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
        const outputChannel = outputs[0][0];
        
        if (!outputChannel) {
            return true;
        }
    
        outputChannel.fill(0);
        
        const voiceCount = this.voices.size;
        if (voiceCount === 0) {
            return true;
        }
        
        // This factor helps prevent clipping when multiple voices are active.
        // It's a simple form of mixing/attenuation. It's a bit more gentle than a sqrt.
        const attenuation = 1 / (1 + Math.max(0, voiceCount - 1) * 0.25);

        let peak = 0;

        for (let i = 0; i < outputChannel.length; i++) {
            let sample = 0;
            for (const [id, voice] of this.voices) {
                sample += voice.render();
                if (voice.isFinished) {
                    this.voices.delete(id);
                }
            }
            
            const attenuatedSample = sample * attenuation;
            // Apply a soft-clipper (tanh) to prevent harsh distortion if it still overloads.
            const finalSample = Math.tanh(attenuatedSample * 1.2); 
            outputChannel[i] = finalSample
            
            const absSample = Math.abs(finalSample);
            if (absSample > peak) {
                peak = absSample;
            }
        }

        // Send a debug message every 100 processing blocks or so to avoid spamming the console
        if (Math.random() < 0.01) {
             this.port.postMessage({ 
                type: 'debug', 
                message: `Active voices: ${voiceCount}, Peak level: ${peak.toFixed(4)}`
            });
        }

        return true;
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

    