
// This script is designed to be loaded into an AudioWorklet.
// It is responsible for playing back pre-loaded drum samples
// with low latency and high performance, off the main thread.

// A simple voice that plays a sample and then marks itself as finished.
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
    constructor() {
        super();
        this.buffers = new Map();
        this.voices = [];
        // Increased maxVoices to handle more complex drum patterns and fills.
        this.maxVoices = 64; 

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
                        // If the voice pool is full, remove the oldest voice to make room.
                        this.voices.shift();
                    }
                    this.voices.push(new Voice(bufferToPlay, volume ?? 1.0));
                } else {
                     this.port.postMessage({ type: 'error', message: `[DrumProcessor] Sample not found: ${sampleName}` });
                }
            }
        } catch (e) {
            if (e instanceof Error) {
                this.port.postMessage({ type: 'error', message: `[DrumProcessor] Error handling message: ${e.message}` });
            }
        }
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        if (!outputChannel) {
            return true; // Stop processing if there's no output channel.
        }

        // It's more efficient to clear the buffer once.
        outputChannel.fill(0);

        if (this.voices.length === 0) {
            return true; // No active voices, nothing to do.
        }
        
        let activeVoices = [];
        // Process each voice and add its output to the main output buffer.
        for (const voice of this.voices) {
            if (!voice.isFinished) {
                voice.process(outputChannel);
                activeVoices.push(voice);
            }
        }

        // Update the voices array with only the active ones.
        this.voices = activeVoices;
        
        // A simple hard limiter to prevent clipping.
        // This is a safety measure if many loud samples play at once.
        for (let i = 0; i < outputChannel.length; i++) {
            const sample = outputChannel[i];
            outputChannel[i] = Math.max(-1, Math.min(1, sample));
        }

        return true; // Keep the processor alive.
    }
}

registerProcessor('drum-processor', DrumProcessor);
