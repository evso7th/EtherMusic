
// public/worklets/drum-processor.js
console.log('[DrumProcessor] Script loading');

class Voice {
  constructor(buffer, volume) {
    this.buffer = buffer;
    this.position = 0;
    this.gain = volume;
    this.finished = false;
  }

  /**
   * Processes a block of audio data.
   * @param {Float32Array} outputChannel - The output channel to write to.
   * @returns {boolean} - True if the voice is still active, false if finished.
   */
  process(outputChannel) {
    if (this.finished) {
      return false;
    }

    const remainingBuffer = this.buffer.length - this.position;
    const processLength = Math.min(outputChannel.length, remainingBuffer);

    for (let i = 0; i < processLength; i++) {
        // Simple linear fade out to prevent clicks
        const envelope = 1.0 - (this.position / this.buffer.length);
        outputChannel[i] += this.buffer[this.position] * this.gain * envelope;
        this.position++;
    }

    if (this.position >= this.buffer.length) {
      this.finished = true;
    }

    return !this.finished;
  }
}

class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.buffers = new Map();
    this.voices = [];

    this.port.onmessage = this.handleMessage.bind(this);
    console.log('[DrumProcessor] Initialized and message handler set up.');
  }

  handleMessage(event) {
    const { type, name, buffer, sampleName, volume = 1.0 } = event.data;

    if (type === 'loadSample') {
      if (name && buffer instanceof ArrayBuffer) {
        const float32Array = new Float32Array(buffer);
        this.buffers.set(name, float32Array);
        this.port.postMessage({ type: 'log', message: `[DrumProcessor] Sample loaded: ${name}, size: ${float32Array.length}` });
      } else {
        this.port.postMessage({ type: 'error', message: `[DrumProcessor] Invalid sample data for ${name}` });
      }
    } else if (type === 'playSample') {
      if (sampleName) {
        this.playSample(sampleName, volume);
      }
    } else {
      this.port.postMessage({ type: 'error', message: `[DrumProcessor] Unknown message type: ${type}` });
    }
  }

  playSample(name, volume) {
    const buffer = this.buffers.get(name);
    if (buffer) {
        if (this.voices.length >= 20) { // Keep a hard limit on voices to prevent overload
            this.voices.shift();
        }
        const voice = new Voice(buffer, volume);
        this.voices.push(voice);
    } else {
        this.port.postMessage({ type: 'log', message: `[DrumProcessor] Sample not found: ${name}. Available: ${[...this.buffers.keys()].join(', ')}` });
    }
  }

  process(inputs, outputs, parameters) {
    const outputChannel = outputs[0]?.[0];
    
    if (!outputChannel) {
        return true;
    }

    outputChannel.fill(0);

    if (this.voices.length === 0) {
        return true;
    }

    let activeVoices = [];
    for (const voice of this.voices) {
      if (voice.process(outputChannel)) {
        activeVoices.push(voice);
      }
    }
    this.voices = activeVoices;

    // A simple hard limiter to prevent clipping
    for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
    }
    
    return true;
  }
}

registerProcessor('drum-processor', DrumProcessor);

    