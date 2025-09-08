
const RENDER_QUANTUM_FRAMES = 128;

const getADSR = (envelope) => {
    const { attack, decay, sustain, release } = envelope || {};
    return {
        attack: Math.max(0.001, attack || 0.01),
        decay: Math.max(0.001, decay || 0.1),
        sustain: Math.max(0, sustain ?? 1.0),
        release: Math.max(0.001, release || 0.5),
    };
};

class Voice {
    constructor(processor, id, freq, vol, preset) {
        this.processor = processor;
        this.context = { sampleRate: processor.sampleRate };
        this.sampleRate = this.context.sampleRate;
        this.id = id;
        
        this.volume = vol;
        this.preset = preset;
        
        this.envelope = getADSR(preset.envelope);
        this.envelopeLevel = 0;
        this.state = 'attack'; // attack, decay, sustain, release, finished
        
        this.portamentoTarget = freq;
        this.frequency = freq;
        this.portamentoTime = preset.portamento > 0 ? 1 - Math.pow(0.01, 1 / (preset.portamento * this.sampleRate)) : 0;

        this.layers = [];
        this.initLayers(freq);

        if (this.preset.vibrato) {
            this.vibrato = {
                lfoPhase: 0,
                lfoSpeed: this.preset.vibrato.frequency / this.sampleRate,
                depth: this.preset.vibrato.depth,
            };
        }

        if (this.preset.filter) {
            this.filter = {
                ...this.preset.filter,
                x1: 0, x2: 0, y1: 0, y2: 0 // filter state
            };
        }
    }

    initLayers(baseFreq) {
        const baseLayer = {
            type: this.preset.oscillator.type,
            detune: this.preset.oscillator.detune || 0,
            level: 1.0,
            freqMult: 1.0,
            phase: 0,
        };
        this.layers.push(baseLayer);

        if (this.preset.layers) {
            this.preset.layers.forEach(layer => {
                this.layers.push({
                    type: layer.type,
                    detune: layer.detune || 0,
                    level: layer.level,
                    freqMult: layer.freqMult,
                    phase: 0,
                });
            });
        }
    }
    
    oscillator(phase, type) {
        switch (type) {
            case 'sine': return Math.sin(phase);
            case 'triangle': return 1 - 4 * Math.abs(0.5 - (phase / (2 * Math.PI)) % 1.0);
            case 'square': return Math.sign(Math.sin(phase));
            case 'sawtooth': return 2 * ((phase / (2 * Math.PI)) - Math.floor(0.5 + (phase / (2 * Math.PI))));
            default: return Math.sin(phase);
        }
    }

    applyFilter(input) {
        if (!this.filter) return input;
        
        const f = this.filter;
        const w0 = 2 * Math.PI * f.frequency / this.sampleRate;
        const cosW0 = Math.cos(w0);
        const sinW0 = Math.sin(w0);
        const alpha = sinW0 / (2 * f.Q);
        
        let b0, b1, b2, a0, a1, a2;
        
        switch (f.type) {
            case 'lowpass':
                b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2;
                a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
                break;
            case 'highpass':
                b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2;
                a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
                break;
            case 'peaking':
                const A = Math.pow(10, f.gain / 40);
                b0 = 1 + alpha * A; b1 = -2 * cosW0; b2 = 1 - alpha * A;
                a0 = 1 + alpha / A; a1 = -2 * cosW0; a2 = 1 - alpha / A;
                break;
            default: return input;
        }

        const xn = input;
        const yn = (b0/a0)*xn + (b1/a0)*f.x1 + (b2/a0)*f.x2 - (a1/a0)*f.y1 - (a2/a0)*f.y2;
        
        f.x2 = f.x1; f.x1 = xn;
        f.y2 = f.y1; f.y1 = yn;

        return yn;
    }

    render() {
        if (this.state === 'attack') {
            this.envelopeLevel += 1 / (this.envelope.attack * this.sampleRate);
            if (this.envelopeLevel >= 1.0) {
                this.envelopeLevel = 1.0;
                this.state = 'decay';
            }
        } else if (this.state === 'decay') {
            const target = this.envelope.sustain;
            const decayRate = (1.0 - target) / (this.envelope.decay * this.sampleRate);
            this.envelopeLevel -= decayRate;
            if (this.envelopeLevel <= target) {
                this.envelopeLevel = target;
                this.state = 'sustain';
            }
        } else if (this.state === 'sustain') {
            // Level is constant
        } else if (this.state === 'release') {
            this.envelopeLevel -= this.envelope.sustain / (this.envelope.release * this.sampleRate);
            if (this.envelopeLevel <= 0) {
                this.envelopeLevel = 0;
                this.state = 'finished';
            }
        }

        if (this.portamentoTime > 0) {
            this.frequency += (this.portamentoTarget - this.frequency) * this.portamentoTime;
        }

        let vibOffset = 0;
        if (this.vibrato && this.vibrato.depth > 0) {
            vibOffset = Math.sin(this.vibrato.lfoPhase) * this.vibrato.depth;
            this.vibrato.lfoPhase += this.vibrato.lfoSpeed * 2 * Math.PI;
            if (this.vibrato.lfoPhase > 2 * Math.PI) this.vibrato.lfoPhase -= 2 * Math.PI;
        }

        let sample = 0;
        this.layers.forEach(layer => {
            const freq = this.frequency * layer.freqMult * Math.pow(2, (layer.detune || 0) / 1200) + vibOffset;
            const phaseIncrement = freq / this.sampleRate;
            sample += this.oscillator(layer.phase, layer.type) * layer.level;
            layer.phase = (layer.phase + phaseIncrement * 2 * Math.PI) % (2 * Math.PI);
        });
        
        const filteredSample = this.applyFilter(sample / this.layers.length);

        return filteredSample * this.envelopeLevel * this.volume;
    }

    update(freq, vol) {
        if(this.portamentoTime > 0) {
            this.portamentoTarget = freq;
        } else {
            this.frequency = freq;
        }
        this.volume = vol;
    }

    release() {
        this.state = 'release';
    }

    isFinished() {
        return this.state === 'finished';
    }
}

class SynthProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.voices = new Map();
        this.polyphony = options.processorOptions.polyphony || 4;
        this.sampleRate = options.processorOptions.sampleRate;
        
        this.preset = this.getDefaultPreset();
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, note, id, preset } = event.data;
        switch (type) {
            case 'setPreset':
                if (preset) this.preset = { ...this.getDefaultPreset(), ...preset };
                break;
            case 'noteOn':
                if (note) this.noteOn(note);
                break;
            case 'noteUpdate':
                 if (note) this.noteUpdate(note);
                break;
            case 'noteOff':
                if (id !== undefined) this.noteOff(id);
                break;
            case 'allNotesOff':
                this.allNotesOff();
                break;
        }
    }

    noteOn(note) {
        if (this.voices.size >= this.polyphony) {
            const oldestVoiceId = this.voices.keys().next().value;
            this.noteOff(oldestVoiceId);
        }
        const voice = new Voice(this, note.id, note.frequency, note.volume, this.preset);
        this.voices.set(note.id, voice);
    }
    
    noteUpdate(note) {
        const voice = this.voices.get(note.id);
        if (voice) {
            voice.update(note.frequency, note.volume);
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

    getDefaultPreset() {
        return {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 },
            filter: { type: 'lowpass', frequency: 20000, Q: 1, gain: 0 },
            portamento: 0,
            vibrato: { frequency: 5, depth: 0 },
            layers: [],
            stagger: 0,
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0];

        for (let i = 0; i < RENDER_QUANTUM_FRAMES; i++) {
            let mixedSample = 0;
            
            this.voices.forEach((voice, id) => {
                if (voice.isFinished()) {
                    this.voices.delete(id);
                } else {
                    mixedSample += voice.render();
                }
            });
            channel[i] = mixedSample;
        }
        
        // Simple hard clipping to prevent explosion
        for (let i = 0; i < channel.length; i++) {
            channel[i] = Math.max(-1, Math.min(1, channel[i]));
        }

        return true;
    }
}

registerProcessor('synth-processor', SynthProcessor);
