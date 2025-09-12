// This script is designed to be loaded into an AudioWorklet.
// It is responsible for playing back pre-loaded drum samples
// with low latency and high performance, off the main thread.
console.log('[DrumProcessor] Script loaded.');

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
    this.maxVoices = 16;
    this.voices = [];
    this.buffers = new Map();

    this.port.onmessage = this.handleMessage.bind(this);
    console.log('[DrumProcessor] Initialized');
  }

  handleMessage(event) {
    const { type, name, buffer, sampleName, volume } = event.data;

    try {
        switch (type) {
            case 'loadSample':
                if (name && buffer instanceof ArrayBuffer) {
                    this.buffers.set(name, new Float32Array(buffer));
                }
                break;
            case 'playSample':
                if (sampleName) {
                    this.playSample(sampleName, volume);
                }
                break;
        }
    } catch (e) {
        if (e instanceof Error) {
            this.port.postMessage({ type: 'error', message: `[DrumProcessor] Error handling message: ${e.message}` });
        }
    }
  }

  playSample(name, volume = 1.0) {
    const buffer = this.buffers.get(name);
    if (buffer) {
        if (this.voices.length >= this.maxVoices) {
            // Remove the oldest finished voice to make room
            const voiceIndex = this.voices.findIndex(v => v.isFinished);
            if (voiceIndex > -1) {
                this.voices.splice(voiceIndex, 1);
            } else {
                this.voices.shift(); // Or just remove the absolute oldest if none are finished
            }
        }
        this.voices.push(new Voice(buffer, volume));
    } else {
        this.port.postMessage({ type: 'error', message: `Sample not found: ${name}` });
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
        if (!voice.isFinished) {
            voice.process(outputChannel);
            activeVoices.push(voice);
        }
    }
    this.voices = activeVoices;
    
    // Simple hard clipping to prevent audio glitches if we exceed [-1, 1]
    for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
    }

    return true; // Keep the processor alive.
  }
}

registerProcessor('drum-processor', DrumProcessor);
