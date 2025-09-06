
// public/worklets/theremin-processor.js

const INSTRUMENT_PARAMS = {
    'synth': { wave: 'sawtooth', filterCutoff: 0.1, attack: 0.01, release: 0.5 },
    'organ': { wave: 'triangle', filterCutoff: 0.5, attack: 0.05, release: 0.3 },
    'theremin': { wave: 'sine', filterCutoff: 0.8, attack: 0.1, release: 1.0 },
    'E-Bells': { wave: 'square', filterCutoff: 0.3, attack: 0.01, release: 1.5 },
    'mellotron': { wave: 'triangle', filterCutoff: 0.6, attack: 0.1, release: 0.8 },
    'G-Drops': { wave: 'sine', filterCutoff: 0.9, attack: 0.01, release: 2.0 },
    'ebass': { wave: 'square', filterCutoff: 0.05, attack: 0.02, release: 0.4 },
};

class ThereminProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.polyphony = options.processorOptions.polyphony || 4;
        
        this.voices = Array(this.polyphony).fill(null).map(() => ({
            isActive: false,
            pointerId: null,
            frequency: 0,
            targetFrequency: 0,
            gain: 0,
            targetGain: 0,
            phase: 0,
            
            // Envelope state
            envState: 'idle', // idle, attack, decay, sustain, release
            envValue: 0,
            
            // Filter state
            filterState: 0
        }));
        
        this.instrument = 'theremin';

        this.port.onmessage = this.handleMessage.bind(this);
    }
    
    getParams() {
        return INSTRUMENT_PARAMS[this.instrument] || INSTRUMENT_PARAMS['theremin'];
    }

    handleMessage(event) {
        const { type, pointerId, frequency, volume, instrument } = event.data;
        const params = this.getParams();

        switch(type) {
            case 'setInstrument':
                if (instrument && INSTRUMENT_PARAMS[instrument]) {
                    this.instrument = instrument;
                }
                break;
            case 'noteOn':
                let voice = this.voices.find(v => v.pointerId === pointerId);
                if (!voice) {
                    voice = this.voices.find(v => !v.isActive);
                }

                if (voice) {
                    // Check for latch toggle: if the same frequency is triggered, turn it off.
                    if (voice.isActive && voice.pointerId === pointerId && Math.abs(voice.frequency - frequency) < 1) {
                         voice.envState = 'release';
                         voice.targetGain = 0;
                    } else {
                        voice.isActive = true;
                        voice.pointerId = pointerId;
                        voice.frequency = frequency;
                        voice.targetFrequency = frequency;
                        voice.targetGain = volume;
                        voice.phase = 0;
                        voice.envState = 'attack';
                    }
                }
                break;
            case 'noteUpdate':
                const activeVoice = this.voices.find(v => v.pointerId === pointerId);
                if (activeVoice) {
                    activeVoice.targetFrequency = frequency;
                    activeVoice.targetGain = volume;
                }
                break;
            case 'noteOff':
                const voiceToRelease = this.voices.find(v => v.pointerId === pointerId);
                if (voiceToRelease) {
                    voiceToRelease.envState = 'release';
                    voiceToRelease.targetGain = 0;
                }
                break;
            case 'allNotesOff':
                 this.voices.forEach(v => {
                    v.envState = 'release';
                    v.targetGain = 0;
                 });
                 break;
        }
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const params = this.getParams();
        const glideTimeSamples = params.attack * sampleRate;
        
        for (let i = 0; i < output[0].length; i++) {
            let mixedSample = 0;

            for (const voice of this.voices) {
                if (!voice.isActive) continue;

                // --- Envelope ---
                if (voice.envState === 'attack') {
                    voice.envValue += 1 / (params.attack * sampleRate);
                    if (voice.envValue >= 1) {
                        voice.envValue = 1;
                        voice.envState = 'sustain';
                    }
                } else if (voice.envState === 'release') {
                    voice.envValue -= 1 / (params.release * sampleRate);
                    if (voice.envValue <= 0) {
                        voice.envValue = 0;
                        voice.isActive = false;
                        voice.pointerId = null;
                        voice.envState = 'idle';
                        continue; // Skip the rest of the processing for this voice
                    }
                }

                // --- Glide / Portamento ---
                if (voice.frequency !== voice.targetFrequency) {
                    // Simple linear interpolation for glide
                    const step = (voice.targetFrequency - voice.frequency) / (0.05 * sampleRate); // 50ms glide
                    voice.frequency += step;
                    if (Math.abs(voice.frequency - voice.targetFrequency) < Math.abs(step)) {
                        voice.frequency = voice.targetFrequency;
                    }
                }
                
                // --- Volume LFO-like smoothing ---
                if (voice.gain !== voice.targetGain) {
                    const step = (voice.targetGain - voice.gain) * 0.05;
                    voice.gain += step;
                }


                // --- Oscillator ---
                let sample = 0;
                const phaseIncrement = voice.frequency / sampleRate;
                
                switch (params.wave) {
                    case 'sine':
                        sample = Math.sin(2 * Math.PI * voice.phase);
                        break;
                    case 'square':
                        sample = Math.sign(Math.sin(2 * Math.PI * voice.phase));
                        break;
                    case 'sawtooth':
                        sample = (voice.phase * 2) - 1;
                        break;
                    case 'triangle':
                        sample = Math.asin(Math.sin(2 * Math.PI * voice.phase)) * (2/Math.PI);
                        break;
                }
                
                voice.phase = (voice.phase + phaseIncrement) % 1;


                // --- Low-pass Filter ---
                voice.filterState += (sample - voice.filterState) * params.filterCutoff;
                sample = voice.filterState;
                
                mixedSample += sample * voice.gain * voice.envValue;
            }

            const finalSample = mixedSample / Math.sqrt(this.polyphony); // Basic mixing to prevent clipping

            for (let channel = 0; channel < output.length; channel++) {
                output[channel][i] = finalSample;
            }
        }
        return true;
    }
}

registerProcessor('theremin-processor', ThereminProcessor);
