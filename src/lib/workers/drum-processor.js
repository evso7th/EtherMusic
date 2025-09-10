
// A simple voice that plays a sample and then marks itself as finished.
class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer; // This is a Float32Array
        this.position = 0;
        this.gain = gain;
        this.isFinished = false;
        // Add a simple fade-out to prevent clicks
        this.releaseSamples = Math.floor(sampleRate * 0.01); // 10ms release
    }

    // This method processes a block of samples.
    process(outputChannel) {
        if (this.isFinished) {
            return;
        }

        const remainingSamples = this.buffer.length - this.position;
        const samplesToProcess = Math.min(outputChannel.length, remainingSamples);

        for (let i = 0; i < samplesToProcess; i++) {
            let envelope = 1.0;
            // Apply fade-out in the last few samples
            if (this.position + i >= this.buffer.length - this.releaseSamples) {
                envelope = (this.buffer.length - (this.position + i)) / this.releaseSamples;
            }
            outputChannel[i] += this.buffer[this.position + i] * this.gain * envelope;
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
        // Increased maxVoices to handle more complex drum patterns and fills
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
                        this.voices.shift();
                    }
                    this.voices.push(new Voice(bufferToPlay, volume ?? 1.0));
                } else {
                    // This can be noisy, so we'll only log it if needed for debugging
                    // this.port.postMessage({ type: 'error', message: `Sample '${sampleName}' not found.` });
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

        outputChannel.fill(0);

        if (this.voices.length === 0) {
            return true; // No active voices, nothing to do.
        }
        
        // This is a more efficient way to manage active voices.
        // It avoids creating a new array on every tick.
        let activeVoiceCount = 0;
        for (let i = 0; i < this.voices.length; i++) {
            const voice = this.voices[i];
            if (!voice.isFinished) {
                voice.process(outputChannel);
                // If the voice is still active after processing, keep it.
                if (!voice.isFinished) {
                    // Move the active voice to the front of the array.
                    this.voices[activeVoiceCount++] = voice;
                }
            }
        }
        // Truncate the array to only include active voices.
        this.voices.length = activeVoiceCount;
        
        // A simple limiter to prevent clipping and audio artifacts.
        for (let i = 0; i < outputChannel.length; i++) {
            const sample = outputChannel[i];
            outputChannel[i] = Math.max(-1, Math.min(1, sample));
        }

        return true; // Keep the processor alive.
    }
}

registerProcessor('drum-processor', DrumProcessor);

    