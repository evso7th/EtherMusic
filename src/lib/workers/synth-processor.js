
// This script is designed to be loaded into an AudioWorklet.
// It is responsible for all real-time synthesis, running in a high-priority
// audio thread to ensure low-latency, glitch-free sound generation.

class Oscillator {
    constructor(type, sampleRate) {
        this.phase = 0;
        this.type = type;
        this.sampleRate = sampleRate;
        this.lastOut = 0;
    }

    // Polynomial Band-Limited Step function for anti-aliasing
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

    process(frequency) {
        let sample = 0;
        const phaseIncrement = frequency / this.sampleRate;
        
        switch (this.type) {
            case 'sine':
                sample = Math.sin(this.phase * 2 * Math.PI);
                break;
            case 'square':
                sample = this.phase < 0.5 ? 1 : -1;
                sample += this.poly_blep(this.phase, phaseIncrement);
                sample -= this.poly_blep((this.phase + 0.5) % 1.0, phaseIncrement);
                break;
            case 'sawtooth':
                sample = 2 * this.phase - 1;
                sample -= this.poly_blep(this.phase, phaseIncrement);
                break;
            case 'triangle':
                 sample = 2 * (this.phase < 0.5 ? this.phase : 1.0 - this.phase) * 2 - 1;
                break;
            default:
                sample = Math.sin(this.phase * 2 * Math.PI);
        }
        this.phase = (this.phase + phaseIncrement) % 1.0;
        return sample;
    }
}

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
            const attackSamples = Math.max(1, (envConfig.attack || 0.001) * this.sampleRate);
            const releaseSamples = Math.max(1, (envConfig.release || 0.001) * this.sampleRate);
            
            return {
                osc: new Oscillator(layerConfig.type || 'sine', this.sampleRate),
                level: layerConfig.level ?? 1.0,
                freqMult: layerConfig.freqMult || 1,
                detune: layerConfig.detune || 0,
                env: {
                    attackInc: 1.0 / attackSamples,
                    decayRate: envConfig.decay > 0 ? (1.0 - (envConfig.sustain ?? 1.0)) / (envConfig.decay * this.sampleRate) : 1,
                    releaseSamples: releaseSamples,
                    sustainLevel: envConfig.sustain ?? 1.0,
                    state: 'attack',
                    currentValue: 0,
                    releaseStartValue: 0,
                },
            };
        };

        if (this.preset.oscillator) {
            this.layers.push(createLayer({ ...this.preset.oscillator, level: 1.0, freqMult: 1.0, envelope: this.preset.envelope }, true));
        }
        if (this.preset.layers) {
             this.preset.layers.forEach(layer => this.layers.push(createLayer(layer, false)));
        }
    }

    initFilter() {
        const filterConfig = this.preset.filter;
        if (!filterConfig || filterConfig.frequency <= 0) {
            this.filter = null;
            return;
        }
        this.filter = { ...filterConfig, y1: 0, y2: 0, x1: 0, x2: 0, active: false };
        this.updateFilterCoeffs();
    }

    updateFilterCoeffs() {
        if(!this.filter) return;
        const { type, Q, gain, frequency } = this.filter;
        const w0 = 2 * Math.PI * frequency / this.sampleRate;
        const cos_w0 = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * Math.max(0.001, Q));
        
        let a0=1, a1=0, a2=0, b0=1, b1=0, b2=0;

        switch (type) {
            case 'lowpass': b0 = (1 - cos_w0) / 2; b1 = 1 - cos_w0; b2 = (1 - cos_w0) / 2; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'peaking': const A = Math.pow(10, gain / 40); b0 = 1 + alpha * A; b1 = -2 * cos_w0; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos_w0; a2 = 1 - alpha / A; break;
            case 'highpass': b0 = (1 + cos_w0) / 2; b1 = -(1 + cos_w0); b2 = (1 + cos_w0) / 2; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            case 'notch': b0 = 1; b1 = -2 * cos_w0; b2 = 1; a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha; break;
            default: this.filter.active = false; return;
        }

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
        let y = f.b0 * inputSample + f.x1;
        if (isNaN(y)) y = 0;
        f.x1 = f.b1 * inputSample - f.a1 * y + f.x2;
        f.x2 = f.b2 * inputSample - f.a2 * y;
        return y;
    }

    processLayerEnvelope(layer) {
        const env = layer.env;
        if (this.isReleasing) {
          if (env.state !== 'release') { 
              env.state = 'release'; 
              env.releaseStartValue = env.currentValue; 
              env.releaseRate = env.currentValue / Math.max(1, env.releaseSamples);
          }
        }
        switch (env.state) {
            case 'attack':
                env.currentValue += env.attackInc;
                if (env.currentValue >= 1.0) { env.currentValue = 1.0; env.state = 'decay'; }
                break;
            case 'decay':
                if (env.sustainLevel < 1.0) {
                    env.currentValue -= env.decayRate;
                    if (env.currentValue <= env.sustainLevel) { env.currentValue = env.sustainLevel; env.state = 'sustain'; }
                } else {
                    env.state = 'sustain';
                }
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
        }
        
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

        // Normalize by number of layers to prevent clipping inside the voice
        const numLayers = this.layers.length || 1;
        mixedSample /= numLayers;
        
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
        this.voices.forEach(voice => voice.release());
    }

    noteOn(note) {
        if (this.voices.has(note.id)) {
            const existingVoice = this.voices.get(note.id);
            if(existingVoice.isReleasing){
                existingVoice.isReleasing = false;
                existingVoice.layers.forEach(l => {
                    l.env.state = 'attack';
                });
            }
            existingVoice.noteUpdate(note.frequency, note.volume);
            return;
        }

        if (this.voices.size >= this.polyphony) {
            let oldestId;
            let oldestVoice = null;
            let oldestTime = Infinity;

            for (const [id, voice] of this.voices.entries()) {
                if (voice.isReleasing) {
                    oldestId = id;
                    break;
                }
                if (voice.startTime < oldestTime) {
                    oldestTime = voice.startTime;
                    oldestId = id;
                }
            }
            if (oldestId) {
                this.voices.delete(oldestId);
            }
        }
        const voice = new Voice(note.id, note.frequency, note.volume, this.preset, sampleRate);
        voice.startTime = currentTime; 
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
        this.voices.forEach(voice => {
            voice.isReleasing = true;
            voice.layers.forEach(l => {
                l.env.releaseSamples = Math.min(l.env.releaseSamples, sampleRate * 0.05); 
            });
        });
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        
        if (!outputChannel) {
            return true;
        }
    
        outputChannel.fill(0);
        
        const voiceCount = this.voices.size;
        if (voiceCount === 0) {
            this.peakLevel = 0;
            return true;
        }
        
        let currentPeak = 0;
        
        for (let i = 0; i < outputChannel.length; i++) {
            let sample = 0;
            for (const [id, voice] of this.voices.entries()) {
                if (voice.isFinished) {
                    this.voices.delete(id);
                } else {
                    sample += voice.render();
                }
            }
            
            const absSample = Math.abs(sample);
            if (absSample > currentPeak) {
                currentPeak = absSample;
            }

            const attenuation = 1 / (1 + Math.max(0, this.voices.size - 1) * 0.5);
            outputChannel[i] = Math.tanh(sample * attenuation * 0.7);
        }

        this.peakLevel = Math.max(this.peakLevel, currentPeak);
        
        this.logCounter++;
        if (this.logCounter >= 200) { 
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

    