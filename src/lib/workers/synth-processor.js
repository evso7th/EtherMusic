
// A class representing a single oscillator with its own phase.
class Oscillator {
    constructor(type, sampleRate) {
        this.phase = 0;
        this.type = type;
        this.sampleRate = sampleRate;
    }

    process(frequency) {
        let sample = 0;
        const phaseIncrement = frequency / this.sampleRate;
        // Basic anti-aliasing for sawtooth and square waves
        const p = this.phase;
        switch (this.type) {
            case 'sine':
                sample = Math.sin(p * 2 * Math.PI);
                break;
            case 'square':
                sample = p < 0.5 ? 1 : -1;
                 // Poly-BLEP anti-aliasing
                let t = p;
                if (t < phaseIncrement) {
                    t /= phaseIncrement;
                    sample += t + t - t * t - 1.0;
                } else if (t > 1.0 - phaseIncrement) {
                    t = (t - 1.0) / phaseIncrement;
                    sample += t + t + t * t + 1.0;
                }
                break;
            case 'sawtooth':
                sample = 2 * p - 1;
                // Poly-BLEP anti-aliasing
                if (p < phaseIncrement) {
                    let t = p / phaseIncrement;
                    sample -= t + t - t * t - 1.0;
                }
                break;
            case 'triangle':
                sample = 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25));
                break;
            default:
                sample = Math.sin(p * 2 * Math.PI);
        }
        this.phase = (p + phaseIncrement) % 1;
        return sample;
    }
}

// A class representing a single synth voice
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

        this.portamentoSpeed = preset.portamento > 0 ? 1 - Math.exp(-1 / (preset.portamento * this.sampleRate * 0.1)) : 0;
        
        this.layers = [];
        this.initLayers();
        this.initFilter();
        this.initLFO();
    }

    initLayers() {
        const createLayer = (layerConfig, baseFreq, isMainOsc) => {
            const freq = (layerConfig.freqMult !== undefined ? baseFreq * layerConfig.freqMult : baseFreq);
            const detunedFreq = freq * Math.pow(2, (layerConfig.detune || 0) / 1200);
            const envConfig = isMainOsc ? this.preset.envelope : (layerConfig.envelope || this.preset.envelope);
            
            const attackSamples = Math.max(1, (envConfig.attack || 0.01) * this.sampleRate);
            const decaySamples = Math.max(1, (envConfig.decay || 0.1) * this.sampleRate);
            const releaseSamples = Math.max(1, (envConfig.release || 0.5) * this.sampleRate);
            
            return {
                osc: new Oscillator(layerConfig.type || 'sine', this.sampleRate),
                level: layerConfig.level ?? 1.0,
                baseFreq: freq,
                currentFreq: detunedFreq,
                env: {
                    attackInc: 1.0 / attackSamples,
                    decayRate: (1.0 - (envConfig.sustain ?? 1.0)) / decaySamples,
                    releaseRate: (envConfig.sustain ?? 1.0) / releaseSamples,
                    sustainLevel: envConfig.sustain ?? 1.0,
                    state: 'attack',
                    currentValue: 0,
                    releaseLevel: 1.0, // Level at which release starts
                },
            };
        };

        if (this.preset.oscillator) {
            const mainOscConfig = { ...this.preset.oscillator, level: 1.0, freqMult: 1, envelope: this.preset.envelope };
            this.layers.push(createLayer(mainOscConfig, this.baseFrequency, true));
        }

        if (this.preset.layers) {
            this.preset.layers.forEach(layer => this.layers.push(createLayer(layer, this.baseFrequency, false)));
        }
    }


    initFilter(filterConfig) {
        if (!filterConfig || filterConfig.frequency <= 0) {
            this.filter = null;
            return;
        }
        this.filter = { ...filterConfig, x1: 0, x2: 0, y1: 0, y2: 0, a0:1, a1:0, a2:0, b0:1, b1:0, b2:0 };
        this.updateFilterCoeffs();
    }
    
    updateFilterCoeffs() {
        if(!this.filter) return;
        const { type, Q, gain, frequency } = this.filter;
        const w0 = 2 * Math.PI * frequency / this.sampleRate;
        const cos_w0 = Math.cos(w0);
        const sin_w0 = Math.sin(w0);
        const alpha = sin_w0 / (2 * Q);
        
        switch (type) {
            case 'lowpass': this.filter.b0 = (1 - cos_w0) / 2; this.filter.b1 = 1 - cos_w0; this.filter.b2 = (1 - cos_w0) / 2; this.filter.a0 = 1 + alpha; this.filter.a1 = -2 * cos_w0; this.filter.a2 = 1 - alpha; break;
            case 'peaking': const A = Math.pow(10, gain / 40); this.filter.b0 = 1 + alpha * A; this.filter.b1 = -2 * cos_w0; this.filter.b2 = 1 - alpha * A; this.filter.a0 = 1 + alpha / A; this.filter.a1 = -2 * cos_w0; this.filter.a2 = 1 - alpha / A; break;
            case 'highpass': this.filter.b0 = (1 + cos_w0) / 2; this.filter.b1 = -(1 + cos_w0); this.filter.b2 = (1 + cos_w0) / 2; this.filter.a0 = 1 + alpha; this.filter.a1 = -2 * cos_w0; this.filter.a2 = 1 - alpha; break;
            case 'bandpass': this.filter.b0 = alpha; this.filter.b1 = 0; this.filter.b2 = -alpha; this.filter.a0 = 1 + alpha; this.filter.a1 = -2 * cos_w0; this.filter.a2 = 1 - alpha; break;
            case 'notch': this.filter.b0 = 1; this.filter.b1 = -2 * cos_w0; this.filter.b2 = 1; this.filter.a0 = 1 + alpha; this.filter.a1 = -2 * cos_w0; this.filter.a2 = 1 - alpha; break;
        }
    }


    initLFO(vibrato) {
        if (!vibrato || vibrato.depth === 0) {
            this.lfo = null;
            return;
        }
        this.lfo = { phase: 0, freq: vibrato.frequency, depth: vibrato.depth, inc: vibrato.frequency / this.sampleRate };
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
        const outputSample = (f.b0/f.a0) * inputSample + (f.b1/f.a0) * f.x1 + (f.b2/f.a0) * f.x2 - (f.a1/f.a0)*f.y1 - (f.a2/f.a0)*f.y2;
        f.x2 = f.x1; f.x1 = inputSample; f.y2 = f.y1; f.y1 = outputSample;
        return outputSample;
    }

    processLayerEnvelope(layer) {
        const env = layer.env;
        if (this.isReleasing && env.state !== 'release') {
            env.state = 'release';
            env.releaseLevel = env.currentValue;
            env.releaseRate = env.currentValue / Math.max(1, (this.preset.envelope.release || 0.5) * this.sampleRate);
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
            case 'sustain': // Do nothing in sustain state
                break;
        }
        return env.currentValue;
    }

    render() {
        if (this.isReleasing && this.layers.every(l => l.env.currentValue <= 0)) {
            this.isFinished = true;
        }
        if (this.isFinished) return 0;
        
        if (this.portamentoSpeed > 0) {
            this.baseFrequency += (this.targetFrequency - this.baseFrequency) * this.portamentoSpeed;
        }

        const lfoModulation = this.processLFO();
        
        let mixedSample = 0;
        this.layers.forEach(layer => {
            const envelopeValue = this.processLayerEnvelope(layer);
            const modulatedFrequency = (this.baseFrequency * layer.freqMult) + lfoModulation;
            const oscSample = layer.osc.process(modulatedFrequency);
            mixedSample += oscSample * layer.level * envelopeValue;
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
        
        if (this.voices.size === 0) {
            return true;
        }

        for (let i = 0; i < outputChannel.length; i++) {
            let sample = 0;
            for (const [id, voice] of this.voices) {
                if (voice.isFinished) {
                    this.voices.delete(id);
                    continue;
                }
                sample += voice.render();
            }
            // Basic limiter to prevent clipping
            outputChannel[i] = Math.max(-1, Math.min(1, sample));
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

    