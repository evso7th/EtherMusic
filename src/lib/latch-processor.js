
class LatchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  constructor(options) {
    super(options);
    this.voices = new Map();
    this.polyphony = options.processorOptions.polyphony || 4;
    
    this.preset = {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
      filter: { Q: 0.7, frequency: 400, type: 'lowpass' },
      portamento: 0,
      layers: [],
      stagger: 0,
    };

    this.port.onmessage = (event) => {
      const { type, note, id, preset } = event.data;
      if (type === 'noteOn') {
        this.noteOn(note);
      } else if (type === 'noteOff') {
        this.noteOff(id);
      } else if (type === 'allNotesOff') {
        this.allNotesOff();
      } else if (type === 'setPreset') {
        this.applyPreset(preset);
      }
    };
  }

  applyPreset(preset) {
    this.preset = { ...this.preset, ...preset };
  }

  noteOn(note) {
    if (this.voices.size >= this.polyphony) {
      const oldestVoiceId = this.voices.keys().next().value;
      this.noteOff(oldestVoiceId);
    }
    
    const voice = this.createVoice(note.frequency, this.preset);
    voice.targetVolume = note.volume;
    this.voices.set(note.id, voice);
  }

  noteOff(id) {
    const voice = this.voices.get(id);
    if (voice) {
      voice.targetVolume = 0; // Start release phase
      voice.isReleasing = true;
    }
  }

  allNotesOff() {
    this.voices.forEach(voice => {
      voice.targetVolume = 0;
      voice.isReleasing = true;
    });
  }

  createVoice(frequency, preset) {
     const createLayer = (layerPreset, baseFreq) => ({
      phase: 0,
      frequency: baseFreq * Math.pow(2, (layerPreset.oscillator?.detune || 0) / 1200),
      type: layerPreset.oscillator?.type || 'sine',
      gain: layerPreset.gain || 1.0,
      envelope: {
        ...layerPreset.envelope,
        state: 'attack',
        currentValue: 0,
        attackSamples: Math.max(1, (layerPreset.envelope?.attack || 0.01) * sampleRate),
        decaySamples: Math.max(1, (layerPreset.envelope?.decay || 0.1) * sampleRate),
        sustain: layerPreset.envelope?.sustain ?? 0.5,
        releaseSamples: Math.max(1, (layerPreset.envelope?.release || 0.5) * sampleRate),
      }
    });

    const mainLayer = createLayer(preset, frequency);
    const additionalLayers = (preset.layers || []).map(layer => createLayer(layer, frequency));

    return {
      id: Math.random(),
      frequency,
      targetVolume: 0,
      currentVolume: 0,
      filterState: [0, 0, 0, 0], // for 2nd order Biquad
      portamentoTime: preset.portamento ? 0.05 / preset.portamento : 0,
      portamentoTarget: frequency,
      layers: [mainLayer, ...additionalLayers],
      stagger: preset.stagger ? preset.stagger * sampleRate : 0,
      staggerCounter: 0,
      isReleasing: false,
    };
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    for (let i = 0; i < channel.length; i++) {
      let sample = 0;
      this.voices.forEach((voice, id) => {
        let voiceSample = 0;
        
        if (voice.portamentoTime > 0) {
          voice.frequency += (voice.portamentoTarget - voice.frequency) * voice.portamentoTime;
        }

        voice.layers.forEach((layer, layerIndex) => {
           if (voice.stagger > 0 && layerIndex > 0 && voice.staggerCounter < voice.stagger * layerIndex) {
              return;
           }
           
           const env = layer.envelope;
           let envelopeValue = env.currentValue;
           
           if (!voice.isReleasing) {
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
           } else {
               envelopeValue -= env.sustain / env.releaseSamples;
               if (envelopeValue <= 0) {
                   envelopeValue = 0;
               }
           }
           env.currentValue = envelopeValue;
           
           const volumeAdjusted = voice.targetVolume;
           
           let oscSample = 0;
           const currentFreq = voice.frequency * Math.pow(2, (layer.oscillator?.detune || 0) / 1200);
           const phaseIncrement = currentFreq / sampleRate;

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
           
           voiceSample += oscSample * envelopeValue * volumeAdjusted * layer.gain;
        });
        
        voice.staggerCounter++;

        const { frequency: cutoff, Q: qValue } = voice.preset?.filter || this.preset.filter;
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

        sample += filteredSample;

        if (voice.isReleasing && voice.layers.every(l => l.envelope.currentValue <= 0)) {
          this.voices.delete(id);
        }
      });

      channel[i] = sample / (Math.sqrt(this.voices.size) + 1);
    }
    return true;
  }
}

registerProcessor('latch-processor', LatchProcessor);
