
console.log('[DrumProcessor] Script loaded');

class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer;
        this.gain = gain;
        this.position = 0;
        this.isFinished = false;
        // A simple exponential decay envelope
        this.decayRate = 0.995; 
    }

    render() {
        if (this.isFinished) {
            return 0;
        }

        const floor = Math.floor(this.position);
        if (floor >= this.buffer.length) {
            this.isFinished = true;
            return 0;
        }

        const sample = this.buffer[floor] || 0;
        this.position++;

        this.gain *= this.decayRate;
        if (this.gain < 0.001) {
            this.isFinished = true;
        }

        return sample * this.gain;
    }
}

class DrumProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.maxVoices = 16;
    this.voices = [];
    this.buffers = new Map();
    console.log('[DrumProcessor] Initialized');

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    console.log('[DrumProcessor] Received:', event.data.type, event.data.name || event.data.sampleName);
    const { type, name, buffer, sampleName, volume } = event.data;

    switch (type) {
        case 'loadSample':
            if (name && buffer) {
                // The buffer received is an ArrayBuffer, so we create a Float32Array from it.
                this.buffers.set(name, new Float32Array(buffer));
                console.log(`[DrumProcessor] Sample loaded: ${name}, size: ${buffer.byteLength}`);
            }
            break;
        case 'playSample':
            if (sampleName) {
                this.playSample(sampleName, volume);
            }
            break;
        default:
            this.port.postMessage({ type: 'error', message: `[DrumProcessor] Unknown message type: ${type}` });
    }
  }

  playSample(name, volume = 1.0) {
    const buffer = this.buffers.get(name);
    console.log(`[DrumProcessor] playSample called for '${name}'. Buffer found:`, !!buffer);
    if (buffer) {
        if (this.voices.length >= this.maxVoices) {
            this.voices.shift();
        }
        const voice = new Voice(buffer, volume);
        this.voices.push(voice);
    } else {
        this.port.postMessage({ type: 'log', message: `Sample not found: ${name}. Buffers available: ${[...this.buffers.keys()].join(', ')}` });
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
            for (let i = 0; i < outputChannel.length; i++) {
                // We only process one sample from the voice per frame in the output buffer
                if (i === 0) {
                    const sampleValue = voice.render();
                    // And apply it to the whole block
                    for(let j=0; j<outputChannel.length; j++) {
                       outputChannel[j] += sampleValue;
                    }
                }
            }
            activeVoices.push(voice);
        }
    }

    this.voices = activeVoices;

    // Apply a simple limiter to prevent clipping
    for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = Math.max(-1, Math.min(1, outputChannel[i]));
    }
    
    return true;
  }
}

registerProcessor('drum-processor', DrumProcessor);
