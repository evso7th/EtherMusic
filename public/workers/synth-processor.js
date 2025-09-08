// Web Audio API Polyphonic Synthesizer Voice
class Voice {
  constructor(id, frequency, preset, sampleRate) {
    this.id = id;
    this.initialFreq = frequency;
    this.sampleRate = sampleRate;
    this.isReleasing = false;
    this.envelopeLevel = 0;
    this.layers = [];
    this.portamentoTarget = frequency;
    this.portamentoTime = preset.portamento ? 1 - Math.pow(0.01, 1 / (sampleRate * preset.portamento)) : 0;
    
    // --- LFO for Vibrato ---
    this.vibrato = preset.vibrato || null;
    if (this.vibrato) {
        this.vibrato.phase = Math.random() * 2 * Math.PI; // Random start phase
        this.vibrato.phaseIncrement = (this.vibrato.frequency || 5) / this.sampleRate * 2 * Math.PI;
    }

    // --- Envelope ---
    const { attack = 0.01, decay = 0.1, sustain = 1.0, release = 0.5 } = preset.envelope;
    this.envelope = {
        attackRate: 1 / (attack * this.sampleRate || 1),
        decayRate: (1 - sustain) / (decay * this.sampleRate || 1),
        releaseRate: sustain / (release * this.sampleRate || 1),
        sustainLevel: sustain,
        stage: 'attack'
    };

    // --- Filter ---
    this.filter = { ...preset.filter };
    this.filter.z1 = 0; this.filter.z2 = 0; // State variables for the filter
    this.calculateFilterCoeffs(this.filter.frequency);

    // --- Layers ---
    const baseLayer = {
        type: preset.oscillator.type,
        freqMult: 1,
        level: 1,
        detune: preset.oscillator.detune || 0,
        phase: 0,
    };
    
    // If the oscillator type is 'custom', it's a multi-layer preset like an organ.
    // The main oscillator settings are ignored, and only the layers are used.
    // Otherwise, we use the main oscillator as the first layer.
    const layersToCreate = (preset.oscillator.type === 'custom' && preset.layers)
      ? preset.layers
      : [baseLayer, ...(preset.layers || [])];
      
    this.layers = layersToCreate.map((layer, index) => ({
      type: layer.type,
      freqMult: layer.freqMult || 1,
      level: layer.level || 0.7,
      detune: layer.detune || 0,
      phase: Math.random() * 2 * Math.PI // Random initial phase for each layer
    }));
  }

  // Calculate biquad filter coefficients
  calculateFilterCoeffs(freq) {
      const { type, Q = 1, gain = 0 } = this.filter;
      const w0 = 2 * Math.PI * freq / this.sampleRate;
      const cos_w0 = Math.cos(w0);
      const sin_w0 = Math.sin(w0);
      const alpha = sin_w0 / (2 * Q);
      
      let b0, b1, b2, a0, a1, a2;

      switch (type) {
          case 'lowpass':
              b0 = (1 - cos_w0) / 2; b1 = 1 - cos_w0; b2 = b0;
              a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
              break;
          case 'highpass':
              b0 = (1 + cos_w0) / 2; b1 = -(1 + cos_w0); b2 = b0;
              a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
              break;
          case 'bandpass':
              b0 = sin_w0 / 2; b1 = 0; b2 = -b0;
              a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
              break;
          case 'peaking':
              const A = Math.pow(10, gain / 40);
              b0 = 1 + alpha * A; b1 = -2 * cos_w0; b2 = 1 - alpha * A;
              a0 = 1 + alpha / A; a1 = -2 * cos_w0; a2 = 1 - alpha / A;
              break;
          default: // lowpass is default
              b0 = (1 - cos_w0) / 2; b1 = 1 - cos_w0; b2 = b0;
              a0 = 1 + alpha; a1 = -2 * cos_w0; a2 = 1 - alpha;
      }
      this.filter.b0 = b0 / a0;
      this.filter.b1 = b1 / a0;
      this.filter.b2 = b2 / a0;
      this.filter.a1 = a1 / a0;
      this.filter.a2 = a2 / a0;
  }
  
  // Oscillator function
  osc(phase, type) {
      switch (type) {
          case 'sine': return Math.sin(phase);
          case 'square': return Math.sign(Math.sin(phase));
          case 'sawtooth': return 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
          case 'triangle': return 2 * Math.abs(2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)))) - 1;
          default: return Math.sin(phase);
      }
  }

  // Process one sample
  render() {
      // Envelope
      if (this.envelope.stage === 'attack') {
          this.envelopeLevel += this.envelope.attackRate;
          if (this.envelopeLevel >= 1.0) {
              this.envelopeLevel = 1.0;
              this.envelope.stage = 'decay';
          }
      } else if (this.envelope.stage === 'decay') {
          this.envelopeLevel -= this.envelope.decayRate;
          if (this.envelopeLevel <= this.envelope.sustainLevel) {
              this.envelopeLevel = this.envelope.sustainLevel;
              this.envelope.stage = 'sustain';
          }
      } else if (this.envelope.stage === 'release') {
          this.envelopeLevel -= this.envelope.releaseRate;
          if (this.envelopeLevel <= 0) {
              this.envelopeLevel = 0;
          }
      }

      // Portamento
      if (this.portamentoTime > 0) {
        this.initialFreq += (this.portamentoTarget - this.initialFreq) * this.portamentoTime;
      }

      // Vibrato
      let vibratoMod = 0;
      if (this.vibrato) {
          vibratoMod = Math.sin(this.vibrato.phase) * (this.vibrato.depth || 0);
          this.vibrato.phase += this.vibrato.phaseIncrement;
      }

      // Layers (Oscillators)
      let mixedSample = 0;
      for (const layer of this.layers) {
          const freq = this.initialFreq * layer.freqMult * Math.pow(2, (layer.detune + vibratoMod) / 1200);
          const phaseIncrement = freq * 2 * Math.PI / this.sampleRate;
          layer.phase += phaseIncrement;
          if (layer.phase > 2 * Math.PI) layer.phase -= 2 * Math.PI;
          mixedSample += this.osc(layer.phase, layer.type) * layer.level;
      }
      mixedSample /= this.layers.length;

      // Filter
      const {b0, b1, b2, a1, a2, z1, z2} = this.filter;
      const filteredSample = mixedSample * b0 + z1;
      this.filter.z1 = mixedSample * b1 + z2 - a1 * filteredSample;
      this.filter.z2 = mixedSample * b2 - a2 * filteredSample;
      
      return filteredSample * this.envelopeLevel;
  }

  release() {
      this.isReleasing = true;
      this.envelope.stage = 'release';
  }

  get isFinished() {
      return this.isReleasing && this.envelopeLevel <= 0;
  }
}

// The main AudioWorkletProcessor
class SynthProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.voices = new Map();
    this.polyphony = options.processorOptions.polyphony || 4;
    this.sampleRate = options.processorOptions.sampleRate || 44100;
    this.portamento = 0;
    
    // Set a default preset
    this.preset = {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.5 },
      filter: { Q: 1, frequency: 15000, type: 'lowpass' },
      portamento: 0
    };

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, note, id, preset, volume } = event.data;
    switch (type) {
      case 'noteOn':
        if (this.voices.size >= this.polyphony) {
          const oldestVoiceId = this.voices.keys().next().value;
          this.voices.delete(oldestVoiceId);
        }
        const voice = new Voice(note.id, note.frequency, this.preset, this.sampleRate);
        voice.globalVolume = note.volume;
        this.voices.set(note.id, voice);
        break;
      case 'noteUpdate':
        if (this.voices.has(id)) {
            const voiceToUpdate = this.voices.get(id);
            voiceToUpdate.portamentoTarget = note.frequency;
            voiceToUpdate.globalVolume = note.volume;
        }
        break;
      case 'noteOff':
        if (this.voices.has(id)) {
          this.voices.get(id)?.release();
        }
        break;
      case 'allNotesOff':
        this.voices.forEach(v => v.release());
        break;
      case 'setPreset':
        if (preset) {
            this.preset = preset;
        }
        break;
    }
  }

  process(inputs, outputs, parameters) {
    const outputChannel = outputs[0][0];

    // Clear buffer
    for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = 0;
    }

    this.voices.forEach((voice, id) => {
        for (let i = 0; i < outputChannel.length; i++) {
            outputChannel[i] += voice.render() * voice.globalVolume;
        }
        if (voice.isFinished) {
            this.voices.delete(id);
        }
    });

    // Normalize to prevent clipping, a simple approach
    if (this.voices.size > 1) {
        const norm = 1 / Math.sqrt(this.voices.size);
        for(let i = 0; i < outputChannel.length; i++) {
            outputChannel[i] *= norm;
        }
    }
    
    return true;
  }
}

registerProcessor('synth-processor', SynthProcessor);

    