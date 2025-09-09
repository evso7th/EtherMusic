// public/workers/drum-processor.js
console.log('[DrumProcessor] Script loaded');

class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer; // This is a Float32Array
        this.position = 0;
        this.gain = gain;
        this.isFinished = false;
        // Simple fade-out to prevent clicks
        this.envelope = 1.0; 
    }

    /**
     * Renders a block of audio.
     * @param {Float32Array} outputBuffer The buffer to write the output to.
     */
    process(outputBuffer) {
        if (this.isFinished) {
            return;
        }

        const remainingSamples = this.buffer.length - this.position;
        const samplesToProcess = Math.min(outputBuffer.length, remainingSamples);

        for (let i = 0; i < samplesToProcess; i++) {
            // Apply a simple linear fade out over the sample's duration to prevent clicks.
            const envelope = 1.0 - ((this.position + i) / this.buffer.length);
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

        this.port.onmessage = this.handleMessage.bind(this);
        console.log('[DrumProcessor] Initialized.');
    }

    handleMessage(event) {
        try {
            const { type, name, buffer, sampleName, volume } = event.data;
            
            if (type === 'loadSample' && name && buffer instanceof ArrayBuffer) {
                 const float32Array = new Float32Array(buffer);
                 this.buffers.set(name, float32Array);
                 // console.log(`[DrumProcessor] Sample loaded and stored: ${name}`);
            } else if (type === 'playSample' && sampleName) {
                const bufferToPlay = this.buffers.get(sampleName);
                if (bufferToPlay) {
                    if (this.voices.length > 20) { // Safety to avoid too many voices
                        this.voices.shift();
                    }
                    this.voices.push(new Voice(bufferToPlay, volume || 1.0));
                } else {
                     this.port.postMessage({ type: 'log', message: `Sample not found: ${sampleName}. Buffers available: ${[...this.buffers.keys()].join(', ')}` });
                }
            } else {
                this.port.postMessage({ type: 'error', message: `[DrumProcessor] Unknown or malformed message: ${JSON.stringify(event.data)}` });
            }
        } catch(e) {
            this.port.postMessage({ type: 'error', message: `[DrumProcessor] Error handling message: ${e.message}` });
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
                // Create a temporary buffer for this voice's output for this block
                const voiceOutput = new Float32Array(outputChannel.length).fill(0);
                voice.process(voiceOutput);

                // Mix it into the main output
                for (let i = 0; i < outputChannel.length; i++) {
                    outputChannel[i] += voiceOutput[i];
                }
                activeVoices.push(voice);
            }
        }
        
        this.voices = activeVoices;
        
        // A simple hard limiter to prevent clipping
        for (let i = 0; i < outputChannel.length; i++) {
            outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
        }

        return true;
    }
}

registerProcessor('drum-processor', DrumProcessor);
