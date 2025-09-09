console.log('[DrumProcessor] Script loaded');

class Voice {
    constructor(buffer, gain, sampleRate) {
        this.buffer = buffer;
        this.gain = gain;
        this.sampleRate = sampleRate;
        this.position = 0;
        this.isFinished = false;

        // Simple ADSR envelope
        this.envelope = {
            attack: 0.005, // 5ms
            decay: 0.1,    // 100ms
            sustain: 0.8,
            release: 0.2, // 200ms
            state: 'attack',
            value: 0
        };
    }

    process() {
        if (this.isFinished) {
            return 0;
        }

        // --- Envelope processing ---
        const env = this.envelope;
        const attackSamples = env.attack * this.sampleRate;
        const decaySamples = env.decay * this.sampleRate;
        
        if (env.state === 'attack') {
            env.value += 1.0 / attackSamples;
            if (env.value >= 1.0) {
                env.value = 1.0;
                env.state = 'decay';
            }
        } else if (env.state === 'decay') {
            env.value -= (1.0 - env.sustain) / decaySamples;
            if (env.value <= env.sustain) {
                env.value = env.sustain;
                env.state = 'sustain';
            }
        }
        
        // Note: Release state is triggered externally by setting voice.isReleasing = true
        if (this.isReleasing) {
             const releaseSamples = env.release * this.sampleRate;
             env.value -= env.sustain / releaseSamples;
             if (env.value <= 0) {
                env.value = 0;
                this.isFinished = true;
             }
        }

        const floor = Math.floor(this.position);
        if (floor >= this.buffer.length) {
            this.isFinished = true;
            return 0;
        }

        // --- Sample playback ---
        const sample = this.buffer[floor] || 0;
        this.position++;

        return sample * this.gain * env.value;
    }

    stop() {
        this.isReleasing = true;
    }
}

class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
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
        const voice = new Voice(buffer, volume, sampleRate);
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
                 // We call process for each sample in the block
                 // This is not perfectly accurate but a simple approximation
                 // A more correct implementation would process sample-by-sample inside the voice
                 if (i === 0) { // Only advance the voice once per block for simplicity
                     const sample = voice.process();
                     // Add the sample to all output samples in the block
                     for(let j=0; j<outputChannel.length; j++) {
                        outputChannel[j] += sample;
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
