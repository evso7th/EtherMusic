
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
        this.envelopeLevel = 0;
    }

    initLayers(preset) {
        const createLayer = (layerConfig, baseFrequency) => {
            // Use frequency from layer if available, otherwise calculate from base
            const freq = layerConfig.freqMult !== undefined 
                ? baseFrequency * layerConfig.freqMult * Math.pow(2, (layerConfig.detune || 0) / 1200)
                : baseFrequency;

            return {
                osc: new Oscillator(layerConfig.type || 'sine', this.sampleRate),
                level: layerConfig.level ?? 1.0,
                baseFreq: freq,
                currentFreq: freq,
            };
        };

        // Main oscillator as the first layer, only if no layers are defined or to add it to the stack
        if (!preset.layers || preset.layers.length === 0) {
            this.layers.push(createLayer({
                type: preset.oscillator?.type || 'sine',
                level: 1.0,
                freqMult: 1,
                detune: preset.oscillator?.detune || 0,
            }, this.baseFrequency));
        } else {
             // If layers are defined, they completely define the sound.
             preset.layers.forEach(layer => this.layers.push(createLayer(layer, this.baseFrequency)));
        }
    }

    initEnvelope(env) {
        this.envelope = {
            attackSamples: Math.max(1, (env.attack || 0.01) * this.sampleRate),
            decaySamples: Math.max(1, (env.decay || 0.1) * this.sampleRate),
            sustainLevel: env.sustain ?? 1.0,
            releaseSamples: Math.max(1, (env.release || 0.5) * this.sampleRate),
            state: 'attack',
            currentValue: 0,
        };
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
        this.lfo.phase += this.lfo.freq / this.sampleRate;
        if (this.lfo.phase >= 1.0) this.lfo.phase -= 1.0;
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
                b0 = (1 - cos_w0) / 2;
                b1 = 1 - cos_w0;
                b2 = (1 - cos_w0) / 2;
                a0 = 1 + alpha;
                a1 = -2 * cos_w0;
                a2 = 1 - alpha;
                break;
            case 'peaking':
                const A = Math.pow(10, gain / 40);
                b0 = 1 + alpha * A;
                b1 = -2 * cos_w0;
                b2 = 1 - alpha * A;
                a0 = 1 + alpha / A;
                a1 = -2 * cos_w0;
                a2 = 1 - alpha / A;
                break;
            default:
                return inputSample;
        }
    
        const outputSample = (b0/a0) * inputSample + (b1/a0) * this.filter.x1 + (b2/a0) * this.filter.x2 - (a1/a0) * this.filter.y1 - (a2/a0) * this.filter.y2;
        
        this.filter.x2 = this.filter.x1;
        this.filter.x1 = inputSample;
        this.filter.y2 = this.filter.y1;
        this.filter.y1 = outputSample;
        
        return isNaN(outputSample) ? 0 : outputSample;
    }

    processEnvelope() {
        const env = this.envelope;
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
                break; // Level remains at sustainLevel
            case 'release':
                env.currentValue -= this.releaseLevel / env.releaseSamples;
                if (env.currentValue <= 0) {
                    env.currentValue = 0;
                    this.isFinished = true;
                }
                break;
        }
        return env.currentValue;
    }

    render() {
        if (this.isFinished) return 0;
        
        if (this.portamentoSpeed > 0) {
            this.baseFrequency += (this.targetFrequency - this.baseFrequency) * this.portamentoSpeed;
        }

        const lfoModulation = this.processLFO();
        this.envelopeLevel = this.processEnvelope();
        
        let mixedSample = 0;
        this.layers.forEach(layer => {
            const modulatedFrequency = (this.baseFrequency + lfoModulation) * (layer.baseFreq / this.baseFrequency);
            mixedSample += layer.osc.process(modulatedFrequency) * layer.level;
        });

        const filteredSample = this.processFilter(mixedSample / this.layers.length);

        return filteredSample * this.envelopeLevel * this.volume;
    }

    noteUpdate(frequency, volume) {
        this.targetFrequency = frequency;
        this.volume = volume;
    }

    release() {
        if (this.isReleasing) return;
        this.isReleasing = true;
        this.envelope.state = 'release';
        this.releaseLevel = this.envelope.currentValue;
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
    }

    noteOn(note) {
        if (this.voices.has(note.id)) {
            // Re-trigger existing note
            const voice = this.voices.get(note.id);
            voice.noteUpdate(note.frequency, note.volume);
            return;
        }

        if (this.voices.size >= this.polyphony) {
            const oldestVoiceId = this.voices.keys().next().value;
            this.voices.delete(oldestVoiceId);
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
        const output = outputs[0];
        const channel = output[0];
        
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
