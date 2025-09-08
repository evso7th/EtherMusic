
class ThereminProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  constructor(options) {
    super(options);
    this.voices = new Map();
    this.polyphony = options.processorOptions.polyphony || 4;
    
    this.preset = {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0.1, sustain: 1.0, release: 0.5 },
      filter: { Q: 1, frequency: 800, type: 'lowpass' },
      portamento: 0,
      layers: [],
    };

    this.port.onmessage = (event) => {
      const { type, note, id, preset } = event.data;
      
      switch (type) {
        case 'noteOn':
          this.noteOn(note);
          break;
        case 'noteUpdate':
          this.noteUpdate(note);
          break;
        case 'noteOff':
          this.noteOff(id);
          break;
        case 'allNotesOff':
          this.allNotesOff();
          break;
        case 'setPreset':
          this.applyPreset(preset);
          break;
      }
    };
  }

  applyPreset(preset) {
    this.preset = {
      ...this.preset,
      ...preset,
      layers: preset.layers || []
    };
  }

  noteOn(note) {
    if (this.voices.size >= this.polyphony) {
        return; // Do not play new notes if polyphony is exceeded
    }

    const voice = this.createVoice(note.frequency, note.volume, this.preset);
    this.voices.set(note.id, voice);
  }

  noteUpdate(note) {
    const voice = this.voices.get(note.id);
    if (voice) {
      voice.portamentoTarget = note.frequency;
      voice.targetVolume = note.volume;
    }
  }

  noteOff(id) {
    const voice = this.voices.get(id);
    if (voice) {
      voice.isReleasing = true;
    }
  }

  allNotesOff() {
    this.voices.forEach(voice => {
      voice.isReleasing = true;
    });
  }

  createVoice(frequency, volume, preset) {
    const createLayer = (layerPreset, baseFreq, baseEnvelope, baseGain) => ({
      phase: 0,
      frequency: baseFreq * Math.pow(2, (layerPreset.oscillator?.detune || 0) / 1200),
      type: layerPreset.oscillator?.type || 'sine',
      gain: (layerPreset.gain ?? 1.0) * baseGain,
      envelope: {
        ...baseEnvelope,
        ...(layerPreset.envelope || {}),
        state: 'attack',
        currentValue: 0,
        attackSamples: Math.max(1, ((layerPreset.envelope?.attack ?? baseEnvelope.attack)) * sampleRate),
        decaySamples: Math.max(1, ((layerPreset.envelope?.decay ?? baseEnvelope.decay)) * sampleRate),
        sustain: layerPreset.envelope?.sustain ?? baseEnvelope.sustain,
        releaseSamples: Math.max(1, ((layerPreset.envelope?.release ?? baseEnvelope.release)) * sampleRate),
      }
    });

    const mainLayer = createLayer(preset, frequency, preset.envelope, 1.0);
    const additionalLayers = (preset.layers || []).map(layer => 
        createLayer(layer, frequency, preset.envelope, 1.0)
    );
    
    return {
      id: Math.random(),
      targetVolume: volume,
      currentVolume: 0,
      filterState: [0, 0, 0, 0], // for 2nd order Biquad
      portamentoTime: preset.portamento ? 0.05 / preset.portamento : 0,
      portamentoTarget: frequency,
      layers: [mainLayer, ...additionalLayers],
      isReleasing: false,
      preset: preset,
    };
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    for (let i = 0; i < channel.length; i++) {
      let sample = 0;
      this.voices.forEach((voice, id) => {
        let voiceSample = 0;
        
        // Smooth volume changes
        voice.currentVolume += (voice.targetVolume - voice.currentVolume) * 0.05;
        
        if (voice.portamentoTime > 0) {
          voice.layers.forEach(layer => {
              const targetFreq = voice.portamentoTarget * Math.pow(2, (layer.oscillator?.detune || 0) / 1200);
              layer.frequency += (targetFreq - layer.frequency) * voice.portamentoTime;
          });
        }
        
        voice.layers.forEach(layer => {
           const env = layer.envelope;
           let envelopeValue = env.currentValue;
           
            if (voice.isReleasing) {
                 envelopeValue -= env.currentValue / env.releaseSamples;
            } else {
               if (env.state === 'attack') {
                   envelopeValue += 1 / env.attackSamples;
                   if (envelopeValue >= 1.0) {
                       envelopeValue = 1.0;
                       env.state = 'decay';
                   }
               } else if (env.state === 'decay') {
                   envelopeValue -= (1.0 - env.sustain) / env.decaySamples;
                   if (envelopeValue <= env.sustain) {
                       envelopeValue = env.sustain;
                       env.state = 'sustain';
                   }
               }
           }
           env.currentValue = Math.max(0, envelopeValue);
           
           let oscSample = 0;
           const phaseIncrement = layer.frequency / sampleRate;

           switch (layer.type) {
               case 'sawtooth':
                   oscSample = (layer.phase * 2) - 1;
                   break;
               case 'square':
                   oscSample = layer.phase < 0.5 ? 1 : -1;
                   break;
               case 'triangle':
                   oscSample = 1 - 4 * Math.abs(Math.round(layer.phase - 0.25) - (layer.phase - 0.25));
                   break;
               case 'sine':
               default:
                   oscSample = Math.sin(layer.phase * 2 * Math.PI);
           }
           layer.phase = (layer.phase + phaseIncrement) % 1;
           
           voiceSample += oscSample * env.currentValue * layer.gain;
        });
        
        const filterPreset = voice.preset.filter;
        const cutoff = filterPreset.frequency;
        const qValue = filterPreset.Q;
        const w0 = 2 * Math.PI * cutoff / sampleRate;
        const alpha = Math.sin(w0) / (2 * qValue);
        const b0 = (1 - Math.cos(w0)) / 2;
        const b1 = 1 - Math.cos(w0);
        const b2 = (1 - Math.cos(w0)) / 2;
        const a0 = 1 + alpha;
        const a1 = -2 * Math.cos(w0);
        const a2 = 1 - alpha;
        
        const [x1, x2, y1, y2] = voice.filterState;
        const filteredSample = (b0/a0)*voiceSample + (b1/a0)*x1 + (b2/a0)*x2 - (a1/a0)*y1 - (a2/a0)*y2;
        voice.filterState = [voiceSample, x1, filteredSample, y1];

        sample += filteredSample * voice.currentVolume;

        if (voice.isReleasing && voice.layers.every(l => l.envelope.currentValue <= 0.0001)) {
          this.voices.delete(id);
        }
      });

      channel[i] = sample / (Math.sqrt(this.voices.size) + 1);
    }
    return true;
  }
}

registerProcessor('theremin-processor', ThereminProcessor);
