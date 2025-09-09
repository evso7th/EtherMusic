

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
        switch (this.type) {
            case 'sine':
                sample = Math.sin(this.phase * 2 * Math.PI);
                break;
            case 'square':
                sample = this.phase < 0.5 ? 1 : -1;
                break;
            case 'sawtooth':
                sample = 2 * this.phase - 1;
                break;
            case 'triangle':
                sample = 1 - 4 * Math.abs(Math.round(this.phase - 0.25) - (this.phase - 0.25));
                break;
            default:
                sample = Math.sin(this.phase * 2 * Math.PI);
        }
        this.phase = (this.phase + phaseIncrement) % 1;
        return sample;
    }
}

// A class representing a single voice, which can be polyphonic with multiple layers.
class Voice {
    constructor(id, frequency, volume, preset, sampleRate) {
        this.id = id;
        this.sampleRate = sampleRate;
        this.isReleasing = false;
        this.releaseLevel = 1.0;
        this.isFinished = false;

        this.baseFrequency = frequency;
        this.targetFrequency = frequency;
        this.volume = volume;

        this.layers = [];
        this.initLayers(preset);
        this.initEnvelope(preset.envelope);
        this.initFilter(preset.filter);
        this.initLFO(preset.vibrato);

        this.portamentoSpeed = preset.portamento > 0 ? 1 - Math.exp(-1 / (preset.portamento * this.sampleRate)) : 0;
    }

    initLayers(preset) {
        this.layers = [];

        const createLayer = (layerConfig, baseFreq, isMainOsc) => {
            const freq = (layerConfig.freqMult !== undefined ? baseFreq * layerConfig.freqMult : baseFreq);
            const detunedFreq = freq * Math.pow(2, (layerConfig.detune || 0) / 1200);

            const envConfig = isMainOsc ? preset.envelope : (layerConfig.envelope || preset.envelope);

            return {
                osc: new Oscillator(layerConfig.type || 'sine', this.sampleRate),
                level: layerConfig.level ?? 1.0,
                baseFreq: freq,
                currentFreq: detunedFreq,
                envelope: {
                    attackSamples: Math.max(1, (envConfig.attack || 0.01) * this.sampleRate),
                    decaySamples: Math.max(1, (envConfig.decay || 0.1) * this.sampleRate),
                    sustainLevel: envConfig.sustain ?? 1.0,
                    releaseSamples: Math.max(1, (envConfig.release || 0.5) * this.sampleRate),
                    state: 'attack',
                    currentValue: 0,
                    releaseLevel: 1.0,
                },
            };
        };
        
        // The main oscillator is treated as the first layer
        if (preset.oscillator) {
            const mainOscillatorConfig = {
                ...preset.oscillator,
                level: 1.0,
                freqMult: 1,
            };
            this.layers.push(createLayer(mainOscillatorConfig, this.baseFrequency, true));
        }
    
        if (preset.layers && preset.layers.length > 0) {
             preset.layers.forEach(layer => this.layers.push(createLayer(layer, this.baseFrequency, false)));
        }
    }
    
    initEnvelope() {
      // Envelope is now per-layer, this main envelope state is for the overall voice state
      this.envelopeState = 'attack';
    }

    initFilter(filter) {
        if (!filter || filter.frequency <= 0) {
            this.filter = null;
            return;
        }
        this.filter = {
            ...filter,
            x1: 0, x2: 0, y1: 0, y2: 0 // Filter state variables
        };
    }

    initLFO(vibrato) {
        if (!vibrato || vibrato.depth === 0) {
            this.lfo = null;
            return;
        }
        this.lfo = {
            phase: 0,
            freq: vibrato.frequency,
            depth: vibrato.depth,
        };
    }

    processLFO() {
        if (!this.lfo) return 0;
        const lfoSample = Math.sin(this.lfo.phase * 2 * Math.PI) * this.lfo.depth;
        this.lfo.phase = (this.lfo.phase + this.lfo.freq / this.sampleRate) % 1.0;
        return lfoSample;
    }

    processFilter(inputSample) {
        if (!this.filter) return inputSample;
    
        const { type, Q, gain, frequency } = this.filter;
        const w0 = 2 * Math.PI * frequency / this.sampleRate;
        const cos_w0 = Math.cos(w0);
        const sin_w0 = Math.sin(w0);
        const alpha = sin_w0 / (2 * Q);
    
        let b0, b1, b2, a0, a1, a2;
    
        switch (type) {
            case 'lowpass':
                b0 = (1 - cos_w0) / 2; b1 = 1 - cos_w0; b2 = (1 - cos_w0) / 2;
                a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
                break;
            case 'peaking':
                const A = Math.pow(10, gain / 40);
                b0 = 1 + alpha * A; b1 = -2 * cos_w0; b2 = 1 - alpha * A;
                a0 = 1 + alpha / A; a1 = -2 * cos_w0; a2 = 1 - alpha / A;
                break;
            case 'highpass':
                b0 = (1 + cos_w0) / 2; b1 = -(1 + cos_w0); b2 = (1 + cos_w0) / 2;
                a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
                break;
            case 'bandpass':
                b0 = alpha; b1 = 0; b2 = -alpha;
                a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
                break;
            case 'notch':
                b0 = 1; b1 = -2 * cos_w0; b2 = 1;
                a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
                break;
            default:
                return inputSample;
        }
    
        const x1 = this.filter.x1 || 0;
        const x2 = this.filter.x2 || 0;
        const y1 = this.filter.y1 || 0;
        const y2 = this.filter.y2 || 0;
        
        let outputSample = (b0/a0) * inputSample + (b1/a0) * x1 + (b2/a0) * x2 - (a1/a0)*y1 - (a2/a0)*y2;
        outputSample = isNaN(outputSample) ? 0 : outputSample;
        
        this.filter.x2 = x1;
        this.filter.x1 = inputSample;
        this.filter.y2 = y1;
        this.filter.y1 = outputSample;
        
        return outputSample;
    }

    processLayerEnvelope(layer) {
        const env = layer.envelope;
        if (this.isReleasing) {
          if (env.state !== 'release') {
              env.state = 'release';
              env.releaseLevel = env.currentValue;
          }
        }

        switch (env.state) {
            case 'attack':
                env.currentValue += 1.0 / env.attackSamples;
                if (env.currentValue >= 1.0) {
                    env.currentValue = 1.0;
                    env.state = 'decay';
                }
                break;
            case 'decay':
                env.currentValue -= (1.0 - env.sustainLevel) / env.decaySamples;
                if (env.currentValue <= env.sustainLevel) {
                    env.currentValue = env.sustainLevel;
                    env.state = 'sustain';
                }
                break;
            case 'sustain':
                break;
            case 'release':
                env.currentValue -= env.releaseLevel / env.releaseSamples;
                if (env.currentValue <= 0) {
                    env.currentValue = 0;
                }
                break;
        }
        return env.currentValue;
    }

    render() {
        if (this.isReleasing && this.layers.every(l => l.envelope.currentValue <= 0)) {
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

    noteUpdate(frequency, volume) {
        this.targetFrequency = frequency;
        this.volume = volume;
    }

    release() {
        if (this.isReleasing) return;
        this.isReleasing = true;
    }
}

class SynthProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.voices = new Map();
        this.polyphony = options.processorOptions?.polyphony || 8;
        this.preset = this.getDefaultPreset();
        
        this.port.onmessage = this.handleMessage.bind(this);
    }
    
    log(...args) {
        this.port.postMessage({ type: 'log', message: args });
    }

    handleMessage(event) {
        const { type, note, id, preset } = event.data;
        this.log(`Synth ${this.polyphony} received:`, type, id);
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
        this.log('Synth applying preset', preset);
        this.preset = { ...this.getDefaultPreset(), ...preset };
        this.allNotesOff();
    }

    noteOn(note) {
        this.log('Synth noteOn:', note);
        if (this.voices.has(note.id)) {
            const voice = this.voices.get(note.id);
            voice.noteUpdate(note.frequency, note.volume);
            return;
        }

        if (this.voices.size >= this.polyphony) {
            const oldestVoiceId = this.voices.keys().next().value;
            this.voices.get(oldestVoiceId)?.release();
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
        this.log('Synth noteOff:', id);
        const voice = this.voices.get(id);
        if (voice) {
            voice.release();
        }
    }

    allNotesOff() {
        this.log('Synth allNotesOff');
        this.voices.forEach(voice => voice.release());
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0];
        
        if (channel) {
            for (let i = 0; i < channel.length; i++) {
                let mixedSample = 0;
                this.voices.forEach((voice, id) => {
                    mixedSample += voice.render();
                    if (voice.isFinished) {
                        this.voices.delete(id);
                    }
                });
                channel[i] = mixedSample;
            }
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
