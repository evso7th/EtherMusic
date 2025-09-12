
// This script is designed to be loaded into an AudioWorklet.
// It is responsible for playing back pre-loaded drum samples
// with low latency and high performance, off the main thread.
console.log('[DrumProcessor] Script loaded');

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
        this.buffers = new Map();
        this.voices = [];
        this.maxVoices = 64; 

        this.port.onmessage = this.handleMessage.bind(this);
        this.port.postMessage({ type: 'debug', message: 'DrumProcessor initialized' });
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
            return true;
        }

        outputChannel.fill(0);

        if (this.voices.length === 0) {
            return true; 
        }
        
        const blockBuffer = new Float32Array(outputChannel.length);

        this.voices = this.voices.filter(voice => {
            if (voice.isFinished) {
                return false;
            }
            // Each voice adds its output to the blockBuffer
            voice.process(blockBuffer);
            return true;
        });
        
        // Add the processed block to the main output and apply a limiter
        for (let i = 0; i < outputChannel.length; i++) {
            // Using tanh as a simple limiter to prevent hard clipping
            outputChannel[i] = Math.tanh(blockBuffer[i]);
        }

        return true; // Keep the processor alive.
    }
}

registerProcessor('drum-processor', DrumProcessor);
