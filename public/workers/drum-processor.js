
// public/worklets/drum-processor.js
console.log('[DrumProcessor] Script loaded');

class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer;
        this.currentTime = 0;
        this.gain = gain;
        this.finished = false;
        // Simple linear fade-out over the last 100 samples to prevent clicks
        this.releaseSamples = 100; 
    }

    process() {
        if (this.finished || this.currentTime >= this.buffer.length) {
            this.finished = true;
            return 0;
        }

        const sample = this.buffer[Math.floor(this.currentTime)];
        this.currentTime += 1; // playbackRate is 1

        // Simple fade out to prevent clicks at the end of the sample
        const remaining = this.buffer.length - this.currentTime;
        if (remaining < this.releaseSamples) {
            return sample * this.gain * (remaining / this.releaseSamples);
        }
        
        return sample * this.gain;
    }
}


class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.buffers = new Map();
    this.voices = [];
    this.maxVoices = 20;

    console.log('[DrumProcessor] Initialized');

    this.port.onmessage = (event) => {
        try {
            const { type, name, buffer, sampleName, volume } = event.data;
            // console.log(`[DrumProcessor] Received message:`, event.data);

            if (type === 'loadSample' && name && buffer instanceof ArrayBuffer) {
                const float32Array = new Float32Array(buffer);
                this.buffers.set(name, float32Array);
                // console.log(`[DrumProcessor] Sample loaded: ${name}, size: ${buffer.byteLength}`);
            } else if (type === 'playSample' && sampleName) {
                const bufferToPlay = this.buffers.get(sampleName);
                if (bufferToPlay) {
                    if (this.voices.length >= this.maxVoices) {
                        this.voices.shift();
                    }
                    this.voices.push(new Voice(bufferToPlay, volume ?? 1.0));
                    // console.log(`[DrumProcessor] Playing sample: ${sampleName}`);
                } else {
                    this.port.postMessage({ type: 'error', message: `Sample '${sampleName}' not found.` });
                }
            }
        } catch (e) {
            this.port.postMessage({ type: 'error', message: `[DrumProcessor] Error: ${e.message}` });
        }
    };
  }

  process(inputs, outputs) {
    const outputChannel = outputs[0]?.[0];
    if (!outputChannel) {
        return true;
    }
    
    // Clear the buffer for the new frame
    outputChannel.fill(0);
    
    let activeVoices = [];
    for (const voice of this.voices) {
        if (!voice.finished) {
            // Process a block of samples for the voice
            for (let i = 0; i < outputChannel.length; i++) {
                outputChannel[i] += voice.process();
            }
            activeVoices.push(voice);
        }
    }
    this.voices = activeVoices;

    // Simple hard limiter to prevent clipping
    for (let i = 0; i < outputChannel.length; i++) {
      outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
    }
    
    return true; // Keep processor alive
  }
}

registerProcessor('drum-processor', DrumProcessor);

    