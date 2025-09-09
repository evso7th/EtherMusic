// public/worklets/drum-processor.js

class SampleVoice {
    constructor(buffer, volume) {
        this.buffer = buffer;
        this.volume = volume;
        this.position = 0;
        this.isFinished = false;
    }

    render() {
        if (this.isFinished) {
            return 0;
        }

        const floor = Math.floor(this.position);
        const sample = this.buffer[floor] || 0;
        
        this.position++;

        if (this.position >= this.buffer.length) {
            this.isFinished = true;
        }

        return sample * this.volume;
    }
}

class DrumProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffers = new Map();
        this.voices = [];
        console.log('[DrumProcessor] Initialized');
        
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        console.log('[DrumProcessor] Received message:', event.data);
        const { type, name, buffer, sampleName, volume } = event.data;

        switch (type) {
            case 'loadSample':
                if (name && buffer) {
                    this.buffers.set(name, new Float32Array(buffer));
                    console.log(`[DrumProcessor] Sample loaded: ${name}, size: ${buffer.byteLength}`);
                }
                break;
            case 'playSample':
                if (sampleName) this.playSample(sampleName, volume);
                break;
            default:
                this.port.postMessage({ type: 'error', message: `[DrumProcessor] Unknown message type: ${type}` });
        }
    }

    playSample(name, volume = 1.0) {
        const buffer = this.buffers.get(name);
        console.log(`[DrumProcessor] playSample called for '${name}'. Buffer found:`, !!buffer);
        if (buffer) {
            // Simple voice stealing: remove the oldest voice if we exceed a limit.
            if (this.voices.length > 16) {
                this.voices.shift();
            }
            const voice = new SampleVoice(buffer, volume);
            this.voices.push(voice);
        } else {
            this.port.postMessage({ type: 'error', message: `Sample not found: ${name}` });
        }
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        if (!outputChannel) {
            return true;
        }

        // Reset the buffer for this frame
        outputChannel.fill(0);

        if (this.voices.length === 0) {
            return true; // No active voices, no need to process further
        }
        
        let hasActiveVoices = false;
        // Process each sample for the current frame
        for (let i = 0; i < outputChannel.length; i++) {
            let frameSample = 0;
            // Iterate backwards to safely remove finished voices
            for (let j = this.voices.length - 1; j >= 0; j--) {
                const voice = this.voices[j];
                frameSample += voice.render();
                if (voice.isFinished) {
                    this.voices.splice(j, 1);
                }
            }
            outputChannel[i] = frameSample;
        }
        
        // Keep the processor alive if there are still voices to play
        return this.voices.length > 0;
    }
}

registerProcessor('drum-processor', DrumProcessor);
