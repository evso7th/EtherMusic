
// A simple voice that plays a sample and then marks itself as finished.
class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer; // This is a Float32Array
        this.position = 0;
        this.gain = gain;
        this.isFinished = false;
    }

    // This method processes a block of samples.
    process(outputChannel) {
        if (this.isFinished) {
            return;
        }

        const remainingSamples = this.buffer.length - this.position;
        const samplesToProcess = Math.min(outputChannel.length, remainingSamples);

        for (let i = 0; i < samplesToProcess; i++) {
            // Apply gain and add to the output buffer
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
        this.maxVoices = 32;

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
                    // Simple voice stealing: if we're at max voices, remove the oldest one.
                    if (this.voices.length >= this.maxVoices) {
                        this.voices.shift();
                    }
                    this.voices.push(new Voice(bufferToPlay, volume ?? 1.0));
                } else {
                    this.port.postMessage({ type: 'error', message: `Sample '${sampleName}' not found.` });
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

        // Reset the output buffer for this processing block.
        outputChannel.fill(0);

        if (this.voices.length === 0) {
            return true; // No active voices, nothing to do.
        }
        
        // Use a new array to store active voices for the next block.
        const activeVoices = [];
        
        for (const voice of this.voices) {
            if (!voice.isFinished) {
                // Each voice adds its output to the main buffer.
                voice.process(outputChannel);
                activeVoices.push(voice);
            }
        }

        // Replace the old voices array with the list of currently active ones.
        this.voices = activeVoices;
        
        // Basic hard-clipping to prevent audio artifacts from exceeding [-1, 1] range.
        for (let i = 0; i < outputChannel.length; i++) {
            outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
        }

        return true; // Keep the processor alive.
    }
}

registerProcessor('drum-processor', DrumProcessor);
