
class ThereminProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.polyphony = options.processorOptions.polyphony || 4;
        this.voices = [];
        for (let i = 0; i < this.polyphony; i++) {
            this.voices.push({
                id: null,
                isActive: false,
                frequency: 0,
                targetGain: 0,
                gain: 0,
                phase: 0
            });
        }
        
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, note, id } = event.data;
        const { frequency, volume, time } = note || {};

        switch (type) {
            case 'noteOn': {
                let voice = this.voices.find(v => !v.isActive);
                if (!voice) {
                    voice = this.voices[0]; // Voice stealing
                }
                if (voice) {
                    voice.isActive = true;
                    voice.id = note.id;
                    voice.frequency = frequency;
                    voice.targetGain = volume;
                    voice.gain = 0; // Start from 0 for smooth attack
                    voice.phase = 0;
                }
                break;
            }
            case 'noteUpdate': {
                const voice = this.voices.find(v => v.id === note.id);
                if (voice) {
                    voice.frequency = frequency;
                    voice.targetGain = volume;
                }
                break;
            }
            case 'noteOff': {
                const voice = this.voices.find(v => v.id === id);
                if (voice) {
                    voice.targetGain = 0; // Fade out
                }
                break;
            }
            case 'allNotesOff': {
                this.voices.forEach(voice => {
                    voice.targetGain = 0;
                });
                break;
            }
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0];

        for (let i = 0; i < channel.length; i++) {
            let mixedSample = 0;
            for (const voice of this.voices) {
                if (voice.isActive) {
                    // Simple ADSR-like envelope
                    // Attack/Decay (ramp to target)
                    voice.gain += (voice.targetGain - voice.gain) * 0.05;

                    // Simple sine wave oscillator
                    voice.phase += voice.frequency / sampleRate;
                    if (voice.phase >= 1.0) voice.phase -= 1.0;
                    
                    mixedSample += Math.sin(voice.phase * 2 * Math.PI) * voice.gain;

                    // Deactivate voice when it's silent
                    if (voice.targetGain === 0 && voice.gain < 0.001) {
                        voice.isActive = false;
                        voice.id = null;
                    }
                }
            }
            channel[i] = mixedSample / this.polyphony; // Basic mixdown
        }

        // If it's a stereo output, copy the signal to the right channel
        if (output.length > 1) {
            output[1].set(output[0]);
        }

        return true;
    }
}

registerProcessor('theremin-processor', ThereminProcessor);
