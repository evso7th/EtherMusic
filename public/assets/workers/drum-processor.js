// public/worklets/drum-processor.js
console.log('[DrumProcessor] Script loaded');

class Voice {
    constructor(buffer, gain) {
        this.buffer = buffer;
        this.position = 0;
        this.gain = gain;
        this.finished = false;
    }

    process(outputChannel) {
        if (this.finished) {
            return;
        }

        const remainingBuffer = this.buffer.length - this.position;
        const processLength = Math.min(outputChannel.length, remainingBuffer);

        for (let i = 0; i < processLength; i++) {
            // Check if position is within bounds
            if (this.position < this.buffer.length) {
                outputChannel[i] += this.buffer[this.position] * this.gain;
                this.position++;
            }
        }
        
        if (this.position >= this.buffer.length) {
            this.finished = true;
        }
    }
}


class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.voices = [];
    this.buffers = new Map();
    console.log('[DrumProcessor] Initialized');

    this.port.onmessage = (event) => {
        const { type, name, buffer, sampleName, volume } = event.data;
        // console.log('[DrumProcessor] Received message:', type, name || sampleName);

        switch (type) {
            case 'loadSample':
                if (name && buffer) {
                    // buffer is already an ArrayBuffer of Float32Array data
                    this.buffers.set(name, new Float32Array(buffer));
                    console.log(`[DrumProcessor] Sample data loaded for: ${name}`);
                }
                break;
            case 'playSample':
                if (sampleName) {
                    const sampleBuffer = this.buffers.get(sampleName);
                    if (sampleBuffer) {
                        if (this.voices.length > 20) { // Limit voices to prevent overload
                           // console.log('[DrumProcessor] Voice limit reached, removing oldest.');
                           this.voices.shift();
                        }
                        // console.log(`[DrumProcessor] Playing sample: ${sampleName} with volume ${volume}`);
                        this.voices.push(new Voice(sampleBuffer, volume || 1.0));
                    } else {
                         this.port.postMessage({ type: 'log', message: `[DrumProcessor] Sample buffer not found for: ${sampleName}` });
                    }
                }
                break;
            default:
                this.port.postMessage({ type: 'error', message: `[DrumProcessor] Unknown message type: ${type}` });
        }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const leftChannel = output[0];
    const rightChannel = output.length > 1 ? output[1] : null;

    if (!leftChannel) {
        return true;
    }

    leftChannel.fill(0);
    if(rightChannel) {
        rightChannel.fill(0);
    }
    
    let activeVoices = [];
    for (const voice of this.voices) {
        if (!voice.finished) {
            voice.process(leftChannel); // Process mono sample into left channel
            activeVoices.push(voice);
        }
    }
    this.voices = activeVoices;

    // If there is a right channel, copy the left channel's content to it for stereo output
    if(rightChannel) {
        rightChannel.set(leftChannel);
    }

    return true;
  }
}

registerProcessor('drum-processor', DrumProcessor);
