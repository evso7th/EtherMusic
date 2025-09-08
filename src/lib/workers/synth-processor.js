// public/workers/synth-processor.js

// A much more robust Voice class that handles its own state.
class Voice {
  constructor(id, frequency, preset, sampleRate) {
    this.id = id;
    this.sampleRate = sampleRate;
    this.layers = [];
    this.isReleasing = false;
    this.releaseStartTime = -1;

    this.baseFrequency = frequency;
    this.targetFrequency = frequency;

    // Initialize main oscillator and layers
    this.initLayers(preset);
    // Initialize envelope
    this.initEnvelope(preset.envelope);
    // Initialize filter
    this.initFilter(preset.filter);
    // Initialize LFO (vibrato)
    this.initLFO(preset.vibrato);

    this.portamentoSpeed = preset.portamento > 0 ? 1 - Math.pow(0.001, 1 / (preset.portamento * this.sampleRate)) : 1;
    this.overallVolume = 0; // Start silent
  }

  initLayers(preset) {
    const createLayer = (layerConfig) => ({
      type: layerConfig.type || 'sine',
      freqMult: layerConfig.freqMult || 1,
      detune: layerConfig.detune || 0,
      level: layerConfig.level || 1.0,
      phase: 0,
    });
    
    // The main oscillator is treated as the first layer
    this.layers.push(createLayer({
      type: preset.oscillator?.type || 'sine',
      level: 1.0, 
      freqMult: 1,
      detune: 0,
    }));

    // Add additional layers
    if (preset.layers) {
      preset.layers.forEach(layer => this.layers.push(createLayer(layer)));
    }
    console.log(`[6a. WORKLET] Voice created with ${this.layers.length} layers.`);
  }

  initEnvelope(env) {
    this.envelope = {
      attackTime: env.attack || 0.01,
      decayTime: env.decay || 0.1,
      sustainLevel: env.sustain ?? 1.0,
      releaseTime: env.release || 0.5,
      state: 'attack',
      level: 0,
    };
  }

  initFilter(filter) {
    if (!filter) {
        this.filter = null;
        return;
    }
    this.filter = {
        type: filter.type,
        q: filter.Q,
        gain: filter.gain,
        freq: filter.frequency,
        // filter state variables
        x1: 0, x2: 0, y1: 0, y2: 0
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

    const { type, q, gain, freq } = this.filter;
    const w0 = 2 * Math.PI * freq / this.sampleRate;
    const alpha = Math.sin(w0) / (2 * q);

    let b0, b1, b2, a0, a1, a2;

    switch (type) {
        case 'lowpass':
            b0 = (1 - Math.cos(w0)) / 2;
            b1 = 1 - Math.cos(w0);
            b2 = (1 - Math.cos(w0)) / 2;
            a0 = 1 + alpha;
            a1 = -2 * Math.cos(w0);
            a2 = 1 - alpha;
            break;
        case 'peaking':
            const A = Math.pow(10, gain / 40);
            b0 = 1 + alpha * A;
            b1 = -2 * Math.cos(w0);
            b2 = 1 - alpha * A;
            a0 = 1 + alpha / A;
            a1 = -2 * Math.cos(w0);
            a2 = 1 - alpha / A;
            break;
        // Add other filter types as needed
        default:
            return inputSample;
    }

    const outputSample = (b0/a0) * inputSample + (b1/a0) * this.filter.x1 + (b2/a0) * this.filter.x2 - (a1/a0) * this.filter.y1 - (a2/a0) * this.filter.y2;
    
    // Update filter state
    this.filter.x2 = this.filter.x1;
    this.filter.x1 = inputSample;
    this.filter.y2 = this.filter.y1;
    this.filter.y1 = outputSample;
    
    // Prevent denormals
    if (Math.abs(this.filter.y1) < 1e-6) this.filter.y1 = 0;
    if (Math.abs(this.filter.y2) < 1e-6) this.filter.y2 = 0;

    return isNaN(outputSample) ? 0 : outputSample;
}


  processEnvelope() {
    const env = this.envelope;
    switch (env.state) {
      case 'attack':
        env.level += 1.0 / (env.attackTime * this.sampleRate);
        if (env.level >= 1.0) {
          env.level = 1.0;
          env.state = 'decay';
        }
        break;
      case 'decay':
        env.level -= (1.0 - env.sustainLevel) / (env.decayTime * this.sampleRate);
        if (env.level <= env.sustainLevel) {
          env.level = env.sustainLevel;
          env.state = 'sustain';
        }
        break;
      case 'sustain':
        // Do nothing
        break;
      case 'release':
        env.level -= env.sustainLevel / (env.releaseTime * this.sampleRate);
        if (env.level <= 0) {
          env.level = 0;
          this.isFinished = true;
        }
        break;
    }
    return env.level;
  }

  processOscillator(layer, freq) {
    let sample;
    const phaseIncrement = freq / this.sampleRate;
    switch (layer.type) {
      case 'sine':
        sample = Math.sin(layer.phase * 2 * Math.PI);
        break;
      case 'square':
        sample = layer.phase < 0.5 ? 1 : -1;
        break;
      case 'sawtooth':
        sample = 2 * layer.phase - 1;
        break;
      case 'triangle':
        sample = 1 - 4 * Math.abs(Math.round(layer.phase - 0.25) - (layer.phase - 0.25));
        break;
      default:
        sample = Math.sin(layer.phase * 2 * Math.PI);
    }
    layer.phase = (layer.phase + phaseIncrement) % 1;
    return sample * layer.level;
  }

  render() {
    if (this.isFinished) return 0;
    
    // Smooth frequency changes (portamento)
    if (this.portamentoSpeed < 1) {
       this.baseFrequency = this.portamentoSpeed * this.baseFrequency + (1 - this.portamentoSpeed) * this.targetFrequency;
    }

    const envelopeLevel = this.processEnvelope();
    const lfoModulation = this.processLFO();

    let mixedSample = 0;
    this.layers.forEach(layer => {
      const freq = (this.baseFrequency + lfoModulation) * layer.freqMult * Math.pow(2, (layer.detune || 0) / 1200);
      mixedSample += this.processOscillator(layer, freq);
    });
    
    const filteredSample = this.processFilter(mixedSample);

    return filteredSample * envelopeLevel * this.overallVolume;
  }

  noteOn(volume) {
      this.overallVolume = volume;
      this.envelope.state = 'attack';
      this.isReleasing = false;
      this.isFinished = false;
  }
  
  noteUpdate(frequency, volume) {
    if (this.portamentoSpeed < 1) {
        this.targetFrequency = frequency;
    } else {
        this.baseFrequency = frequency;
    }
    this.overallVolume = volume;
  }

  release() {
    this.isReleasing = true;
    this.envelope.state = 'release';
  }
}

class SynthProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.voices = new Map();
    this.polyphony = options.processorOptions?.polyphony || 8;
    this.preset = this.getDefaultPreset();
    
    this.port.onmessage = (event) => {
        console.log('[4. WORKLET] synth-processor.js: Received message:', event.data);
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
    };
  }

  applyPreset(preset) {
    console.log('[5. WORKLET] synth-processor.js: Applying preset', preset);
    this.preset = { ...this.getDefaultPreset(), ...preset };
  }

  noteOn(note) {
    if (this.voices.size >= this.polyphony) {
        const oldestVoiceId = this.voices.keys().next().value;
        this.voices.delete(oldestVoiceId);
    }
    const voice = new Voice(note.id, note.frequency, this.preset, sampleRate);
    voice.noteOn(note.volume);
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

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    
    for (let i = 0; i < channel.length; i++) {
        let sample = 0;
        this.voices.forEach((voice, id) => {
            sample += voice.render();
            if (voice.isFinished) {
                this.voices.delete(id);
            }
        });
        channel[i] = sample;
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
