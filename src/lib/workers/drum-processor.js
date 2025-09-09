
class SampleVoice {
    constructor(buffer, volume) {
        this.buffer = buffer;
        this.volume = volume;
        this.position = 0;
        this.isFinished = false;
    }

    render() {
        if (this.isFinished) {
            return 0;
        }
        
        // Simple linear interpolation for smoother playback at different rates
        const floor = Math.floor(this.position);
        const ceil = Math.ceil(this.position);
        const fract = this.position - floor;

        const sample1 = this.buffer[floor] || 0;
        const sample2 = this.buffer[ceil] || 0;
        
        const sample = sample1 + (sample2 - sample1) * fract;
        
        this.position++;

        if (this.position >= this.buffer.length) {
            this.isFinished = true;
        }

        return sample * this.volume;
    }
}


class DrumProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = new Map();
    this.voices = [];
    this.maxVoices = 16;
    console.log('[DrumProcessor] Initialized');

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, name, buffer, sampleName, volume } = event.data;
    console.log('[DrumProcessor] Received message:', event.data.type, name || sampleName);

    switch (type) {
      case 'loadSample':
        if (name && buffer) {
          this.buffers.set(name, new Float32Array(buffer));
          console.log(`[DrumProcessor] Sample loaded: ${name}, size: ${buffer.byteLength}`);
        }
        break;
      case 'playSample':
        if (sampleName) {
            this.playSample(sampleName, volume);
        }
        break;
      default:
        this.port.postMessage({ type: 'error', message: `[DrumProcessor] Unknown message type: ${type}` });
    }
  }

  playSample(name, volume = 1.0) {
    const buffer = this.buffers.get(name);
    console.log(`[DrumProcessor] playSample called for '${name}'. Buffer found:`, !!buffer);
    if (buffer) {
        // Simple voice stealing: remove the oldest voice if we exceed a limit.
        if (this.voices.length >= this.maxVoices) {
            this.voices.shift();
        }
        const voice = new SampleVoice(buffer, volume);
        this.voices.push(voice);
    } else {
        this.port.postMessage({ type: 'error', message: `Sample not found: ${name}` });
    }
  }

  process(inputs, outputs) {
    const outputChannel = outputs[0]?.[0];
    if (!outputChannel) {
      return true; // Stop processing if output is not available
    }
    
    // Clear the buffer for this frame
    outputChannel.fill(0);

    if (this.voices.length === 0) {
      return true; // No active voices, no need to process further
    }

    for (let i = 0; i < outputChannel.length; i++) {
      let frameSample = 0;
      // Iterate backwards to safely remove finished voices while iterating
      for (let j = this.voices.length - 1; j >= 0; j--) {
        const voice = this.voices[j];
        frameSample += voice.render();
        if (voice.isFinished) {
          this.voices.splice(j, 1);
        }
      }
      // Basic limiter to prevent clipping
      outputChannel[i] = Math.max(-1, Math.min(1, frameSample));
    }
    
    // Keep the processor alive as long as there are voices playing
    return this.voices.length > 0;
  }
}

registerProcessor('drum-processor', DrumProcessor);
