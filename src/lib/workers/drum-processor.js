// public/workers/drum-processor.js
console.log('[DrumProcessor] Script loaded');

class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer; // This is a Float32Array
        this.position = 0;
        this.gain = gain;
        this.isFinished = false;
    }

    /**
     * Renders one sample and returns it.
     * @returns {number} The audio sample for the current frame.
     */
    process() {
        if (this.isFinished) {
            return 0;
        }

        // Simple linear fade out over the sample's duration to prevent clicks.
        // This is a basic form of an amplitude envelope.
        const envelope = 1.0 - (this.position / this.buffer.length);
        
        const sample = this.buffer[this.position] * this.gain * envelope;
        
        this.position++;
        
        if (this.position >= this.buffer.length) {
            this.isFinished = true;
        }
        
        return sample;
    }
}


class DrumProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.buffers = new Map();
        this.voices = [];

        this.port.onmessage = this.handleMessage.bind(this);
        console.log('[DrumProcessor] Initialized.');
    }

    handleMessage(event) {
        const { type, name, buffer, sampleName, volume } = event.data;

        if (type === 'loadSample' && name && buffer instanceof Float32Array) {
            this.buffers.set(name, buffer);
            // console.log(`[DrumProcessor] Sample loaded and stored: ${name}`);
        } else if (type === 'playSample' && sampleName) {
            const bufferToPlay = this.buffers.get(sampleName);
            if (bufferToPlay) {
                 if (this.voices.length > 20) { // Safety to avoid too many voices
                    this.voices.shift();
                }
                this.voices.push(new Voice(bufferToPlay, volume || 1.0));
            } else {
                 this.port.postMessage({ type: 'log', message: `Sample not found: ${sampleName}` });
            }
        } else {
            this.port.postMessage({ type: 'error', message: `Unknown or malformed message: ${JSON.stringify(event.data)}` });
        }
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0][0];

        if (!outputChannel) {
            return true;
        }

        // Fill with silence first
        outputChannel.fill(0);

        if (this.voices.length === 0) {
            return true;
        }
        
        let activeVoices = [];
        for (const voice of this.voices) {
            if (!voice.isFinished) {
                // Mix the voice's output into the channel buffer
                for (let i = 0; i < outputChannel.length; i++) {
                    outputChannel[i] += voice.process();
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
