
// This script is designed to be loaded into an AudioWorklet.
// It is responsible for playing back pre-loaded drum samples
// with low latency and high performance, off the main thread.

class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer; // This is a Float32Array
        this.position = 0;
        this.gain = gain;
        this.isFinished = false;
    }

    // This method processes a block of 128 samples (the standard render quantum).
    process(outputChannel) {
        if (this.isFinished) {
            return;
        }

        const remainingSamples = this.buffer.length - this.position;
        const samplesToProcess = Math.min(outputChannel.length, remainingSamples);

        for (let i = 0; i < samplesToProcess; i++) {
            // Add the sample to the output buffer, scaled by gain.
            outputChannel[i] += this.buffer[this.position + i] * this.gain;
        }

        this.position += samplesToProcess;

        if (this.position >= this.buffer.length) {
            this.isFinished = true;
        }
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
            } else {
                this.port.postMessage({ type: 'error', message: `Sample not found: ${sampleName}` });
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
    
    let peak = 0;

    if (this.voices.length > 0) {
        for (let i = 0; i < outputChannel.length; i++) {
            let sample = 0;
            this.voices.forEach(voice => {
                if (!voice.isFinished) {
                    const voiceSamplePosition = voice.position + i;
                    if (voiceSamplePosition < voice.buffer.length) {
                        sample += voice.buffer[voiceSamplePosition] * voice.gain;
                    }
                }
            });
            
            sample = Math.max(-1, Math.min(1, sample));
            outputChannel[i] = sample;
            
            const absSample = Math.abs(sample);
            if (absSample > peak) {
                peak = absSample;
            }
        }

        this.voices = this.voices.filter(voice => {
            voice.position += outputChannel.length;
            return voice.position < voice.buffer.length;
        });
    }

    return true; // Keep the processor alive.
  }
}

registerProcessor('drum-processor', DrumProcessor);

    