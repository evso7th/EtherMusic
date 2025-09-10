
// public/workers/drum-processor.js
class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer; // This is a Float32Array
        this.position = 0;
        this.gain = gain;
        this.isFinished = false;
    }

    process(outputBuffer) {
        if (this.isFinished) {
            return;
        }

        const remainingSamples = this.buffer.length - this.position;
        const samplesToProcess = Math.min(outputBuffer.length, remainingSamples);

        for (let i = 0; i < samplesToProcess; i++) {
            // Simple linear fade-out over the last 100 samples to prevent clicks
            const envelope = (this.buffer.length - (this.position + i)) > 100 
                ? 1.0 
                : (this.buffer.length - (this.position + i)) / 100;
            outputBuffer[i] += this.buffer[this.position + i] * this.gain * envelope;
        }
        
        this.position += samplesToProcess;
        
        if (this.position >= this.buffer.length) {
            this.isFinished = true;
        }
    }
}

class DrumProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = new Map();
    this.voices = [];
    this.maxVoices = 32; // Increased polyphony

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
          this.port.postMessage({ type: 'error', message: `Sample '${sampleName}' not found.` });
        }
      }
    } catch(e) {
      if(e instanceof Error) {
        this.port.postMessage({ type: 'error', message: `[DrumProcessor] Error handling message: ${e.message}` });
      }
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
    
    // Process each active voice and accumulate its output
    for(const voice of this.voices) {
        if (!voice.isFinished) {
            // A temporary buffer for this voice's output for this block
            const voiceOutput = new Float32Array(outputChannel.length).fill(0);
            voice.process(voiceOutput);

            // Mix into the main output buffer
            for (let i = 0; i < outputChannel.length; i++) {
                outputChannel[i] += voiceOutput[i];
            }
        }
    }

    // Remove finished voices
    this.voices = this.voices.filter(voice => !voice.isFinished);
    
    // Simple hard limiter to prevent clipping
    for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
    }

    return true; // Keep the processor alive
  }
}

registerProcessor('drum-processor', DrumProcessor);

    