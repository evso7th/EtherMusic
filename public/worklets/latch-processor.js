class LatchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    
    this.voices = new Map(); // Using frequency as key for simplicity here
    this.polyphony = options?.processorOptions?.polyphony || 4;
    
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(data) {
    const { type, note, id } = data;

    switch (type) {
      case 'noteOn':
        this.noteOn(note);
        break;
      case 'noteOff':
        this.noteOff(id);
        break;
      case 'allNotesOff':
        this.allNotesOff();
        break;
    }
  }

  noteOn(note) {
    if (this.voices.size >= this.polyphony) {
        // If we're at max polyphony, something is out of sync, but we should still play the new note.
        // The logic in LatchEngine should prevent this.
        console.warn('LatchProcessor: Polyphony limit reached, a note might be stolen.');
    }
    this.voices.set(note.id, {
      frequency: note.frequency,
      targetGain: note.volume,
      currentGain: 0,
      phase: 0
    });
  }

  noteOff(id) {
    const voice = this.voices.get(id);
    if (voice) {
      voice.targetGain = 0; // Start fade out
    }
  }

  allNotesOff() {
    this.voices.forEach(voice => {
      voice.targetGain = 0;
    });
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    const sampleRate = globalThis.sampleRate;

    for (let i = 0; i < channel.length; i++) {
      let mixedSample = 0;

      for (const [id, voice] of this.voices.entries()) {
        // Smooth gain transition
        voice.currentGain += (voice.targetGain - voice.currentGain) * 0.05; // 0.05 is the fade speed

        voice.phase += (voice.frequency / sampleRate) * 2 * Math.PI;
        if (voice.phase > 2 * Math.PI) {
          voice.phase -= 2 * Math.PI;
        }

        mixedSample += Math.sin(voice.phase) * voice.currentGain;

        // If voice has faded out, remove it
        if (voice.targetGain === 0 && voice.currentGain < 0.001) {
          this.voices.delete(id);
        }
      }
      
      // Apply to all output channels (mono)
      for (let ch = 0; ch < output.length; ch++) {
        output[ch][i] = mixedSample * 0.5; // Reduce overall volume to prevent clipping
      }
    }

    return true;
  }
}

registerProcessor('latch-processor', LatchProcessor);
