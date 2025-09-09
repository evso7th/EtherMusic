// A simple sample player voice
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

        // Using linear interpolation for smoother playback
        const floor = Math.floor(this.position);
        const ceil = Math.ceil(this.position);
        const fract = this.position - floor;

        const sample1 = this.buffer[floor] || 0;
        const sample2 = this.buffer[ceil] || 0;
        
        const sample = sample1 + (sample2 - sample1) * fract;

        this.position++;

        if (this.position >= this.buffer.length) {
            this.isFinished = true;
        }

        return sample * this.volume;
    }
}

class DrumProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.samples = new Map();
        this.activeVoices = [];
        
        console.log('[DrumProcessor] Initialized.');
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        console.log('[DrumProcessor] Received message:', event.data);
        const { type, samples, sampleName, volume } = event.data;

        switch (type) {
            case 'loadSamples':
                if (samples) this.loadSamples(samples);
                break;
            case 'playSample':
                if (sampleName) this.playSample(sampleName, volume);
                break;
            default:
                this.port.postMessage({ type: 'error', message: `[DrumProcessor] Unknown message type: ${type}` });
        }
    }

    loadSamples(samples) {
        try {
            console.log('[DrumProcessor] Loading samples:', samples.map(s => s.name));
            samples.forEach(sample => {
                this.samples.set(sample.name, new Float32Array(sample.buffer));
            });
            console.log('[DrumProcessor] Samples loaded successfully. Available samples:', ...this.samples.keys());
        } catch (e) {
            this.port.postMessage({ type: 'error', message: `[DrumProcessor] Sample loading failed: ${e.message}` });
        }
    }

    playSample(name, volume = 1.0) {
        const buffer = this.samples.get(name);
        console.log(`[DrumProcessor] playSample called for '${name}'. Buffer found:`, !!buffer);
        if (buffer) {
            const voice = new SampleVoice(buffer, volume);
            this.activeVoices.push(voice);
        } else {
            this.port.postMessage({ type: 'error', message: `[DrumProcessor] Sample not found: ${name}` });
        }
    }

    process(inputs, outputs, parameters) {
        const outputChannel = outputs[0]?.[0];
        if (!outputChannel) {
            return true;
        }

        outputChannel.fill(0);

        if (this.activeVoices.length === 0) {
            return true;
        }
        
        for (let i = 0; i < outputChannel.length; i++) {
            let frameSample = 0;
            for (let j = this.activeVoices.length - 1; j >= 0; j--) {
                const voice = this.activeVoices[j];
                frameSample += voice.render();
                if (voice.isFinished) {
                    this.activeVoices.splice(j, 1);
                }
            }
            outputChannel[i] = Math.max(-1, Math.min(1, frameSample));
        }

        return true;
    }
}

registerProcessor('drum-processor', DrumProcessor);
