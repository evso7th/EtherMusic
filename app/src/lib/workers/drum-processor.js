

// This script is designed to be loaded into an AudioWorklet.
// It is responsible for playing back pre-loaded drum samples
// with low latency and high performance, off the main thread.
console.log('[DrumProcessor] Script loaded.');

class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer; // This is a Float32Array
        this.position = 0;
        this.gain = gain;
    }

    // This method processes a block of 128 samples (the standard render quantum).
    process(outputChannel) {
        if (this.position >= this.buffer.length) {
            return true; // true indicates finished
        }

        const remainingSamples = this.buffer.length - this.position;
        const samplesToProcess = Math.min(outputChannel.length, remainingSamples);

        for (let i = 0; i < samplesToProcess; i++) {
            // Add the sample to the output buffer, scaled by gain.
            outputChannel[i] += this.buffer[this.position + i] * this.gain;
        }

        this.position += samplesToProcess;

        return this.position >= this.buffer.length;
    }
}

class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.maxVoices = 64;
    this.voices = [];
    this.buffers = new Map();
    
    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    try {
        const { type, name, buffer, sampleName, volume } = event.data;

        if (type === 'loadSample' && name && buffer instanceof ArrayBuffer) {
            const float32Array = new Float32Array(buffer);
            this.buffers.set(name, float32Array);
        } else if (type === 'playSample' && sampleName) {
            const bufferToPlay = this.buffers.get(sampleName);
            if (bufferToPlay) {
                if (this.voices.length >= this.maxVoices) {
                    this.voices.shift();
                }
                this.voices.push(new Voice(bufferToPlay, volume ?? 1.0));
            }
        }
    } catch (e) {
        if (e instanceof Error) {
            this.port.postMessage({ type: 'error', message: `Error handling message: ${e.message}` });
        }
    }
  }

  process(inputs, outputs, parameters) {
    const outputChannel = outputs[0]?.[0];
    if (!outputChannel) {
        return true;
    }

    outputChannel.fill(0);

    if (this.voices.length > 0) {
        // Create a temporary buffer to mix into, to avoid modifying the output directly in the loop
        const mixBuffer = new Float32Array(outputChannel.length).fill(0);

        this.voices = this.voices.filter(voice => {
            const tempOutput = new Float32Array(outputChannel.length).fill(0);
            const isFinished = voice.process(tempOutput);

            // Add the voice's output to the mix buffer
            for (let i = 0; i < mixBuffer.length; i++) {
                mixBuffer[i] += tempOutput[i];
            }

            return !isFinished;
        });

        // Apply the mixed signal to the actual output, with a simple limiter
        for (let i = 0; i < outputChannel.length; i++) {
            outputChannel[i] = Math.max(-1, Math.min(1, mixBuffer[i]));
        }
    }
    
    return true; // Keep the processor alive.
  }
}

registerProcessor('drum-processor', DrumProcessor);
