
class ThereminProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this.polyphony = options.processorOptions.polyphony || 4;
        this.voices = Array(this.polyphony).fill(null).map(() => ({
            isActive: false,
            pointerId: null,
            frequency: 0,
            targetFrequency: 0,
            gain: 0,
            targetGain: 0,
            phase: 0,
            glideProgress: 1, // Start at 1 to prevent gliding on first note
            glideTime: 0.05, // Glide time in seconds
            env: { attack: 0.01, release: 0.5 },
            envelopePhase: 'idle', // idle, attack, sustain, release
            envelopeLevel: 0
        }));

        this.instrument = 'theremin';

        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, note, id, instrument } = event.data;

        if (type === 'setInstrument') {
            this.instrument = instrument;
            this.voices.forEach(v => {
                if (v.isActive) {
                    v.targetGain = 0; // fade out old instrument sound
                }
            });
            return;
        }

        if (type === 'allNotesOff') {
            this.voices.forEach(v => {
                v.targetGain = 0;
            });
            return;
        }

        if (!note && !id) return;
        
        const pointerId = note ? note.id : id;

        if (type === 'noteOn') {
            let voice = this.voices.find(v => v.pointerId === pointerId);
            if (!voice) {
                voice = this.voices.find(v => !v.isActive);
            }

            if (voice) {
                voice.isActive = true;
                voice.pointerId = pointerId;
                voice.targetFrequency = note.frequency;
                voice.targetGain = note.volume;
                // If the voice was inactive, jump to the frequency, otherwise glide
                if (voice.envelopePhase === 'idle' || voice.envelopePhase === 'release') {
                    voice.frequency = note.frequency;
                    voice.glideProgress = 1;
                } else {
                    voice.glideProgress = 0;
                }
                voice.envelopePhase = 'attack';
            }
        } else if (type === 'noteUpdate') {
            const voice = this.voices.find(v => v.pointerId === pointerId);
            if (voice) {
                if (voice.targetFrequency !== note.frequency) {
                     voice.targetFrequency = note.frequency;
                     voice.glideProgress = 0;
                }
                voice.targetGain = note.volume;
            }
        } else if (type === 'noteOff') {
            const voice = this.voices.find(v => v.pointerId === pointerId);
            if (voice) {
                voice.envelopePhase = 'release';
            }
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channel = output[0]; // Process mono and copy to stereo later if needed

        for (let i = 0; i < channel.length; i++) {
            let mixedSample = 0;

            for (const voice of this.voices) {
                if (!voice.isActive) continue;

                // --- Envelope ---
                if (voice.envelopePhase === 'attack') {
                    voice.envelopeLevel += 1 / (sampleRate * voice.env.attack);
                    if (voice.envelopeLevel >= 1) {
                        voice.envelopeLevel = 1;
                        voice.envelopePhase = 'sustain';
                    }
                } else if (voice.envelopePhase === 'release') {
                    voice.envelopeLevel -= 1 / (sampleRate * voice.env.release);
                    if (voice.envelopeLevel <= 0) {
                        voice.envelopeLevel = 0;
                        voice.isActive = false;
                        voice.pointerId = null;
                        voice.envelopePhase = 'idle';
                        continue;
                    }
                }
                
                // --- Glide (Portamento) ---
                if (voice.frequency !== voice.targetFrequency) {
                     voice.glideProgress += 1 / (sampleRate * voice.glideTime);
                     voice.glideProgress = Math.min(1, voice.glideProgress);
                     const t = 0.5 * (1 - Math.cos(Math.PI * voice.glideProgress)); // Ease in/out
                     voice.frequency = voice.frequency + (voice.targetFrequency - voice.frequency) * t;
                }
                
                // --- Oscillator ---
                let sample = 0;
                const phaseIncrement = voice.frequency / sampleRate;

                // Simple waveform generator based on instrument
                switch (this.instrument) {
                    case 'organ': // Additive synthesis for organ
                         sample = (Math.sin(voice.phase * (2 * Math.PI)) * 0.6 +
                                  Math.sin(voice.phase * 2 * (2 * Math.PI)) * 0.2 +
                                  Math.sin(voice.phase * 3 * (2 * Math.PI)) * 0.1 +
                                  Math.sin(voice.phase * 4 * (2 * Math.PI)) * 0.1) / 1.0;
                        break;
                    case 'ebass': // Square wave for bass
                        sample = Math.sign(Math.sin(voice.phase * 2 * Math.PI));
                        break;
                    case 'theremin':
                    case 'synth':
                    default: // Sine wave for others
                        sample = Math.sin(voice.phase * 2 * Math.PI);
                        break;
                }

                voice.phase = (voice.phase + phaseIncrement) % 1.0;

                mixedSample += sample * voice.envelopeLevel * voice.targetGain;
            }

            const finalSample = mixedSample / (this.polyphony > 0 ? Math.sqrt(this.polyphony) : 1);
            
            // Output to all channels
            for(let j=0; j < output.length; j++) {
                output[j][i] = finalSample;
            }
        }

        return true;
    }
}

registerProcessor('theremin-processor', ThereminProcessor);
