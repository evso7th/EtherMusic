// public/worklets/drum-processor.js

class DrumProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        // State
        this.isPlaying = false;
        this.bpm = 120;
        this.patternName = 'Off';
        this.step = 0;
        this.nextTickTime = currentTime;

        // Load drum samples into a Map
        this.samples = new Map();
        this.loadSamples(options.processorOptions.samples);

        this.patterns = {
            'Off': [],
            'Air': [
                { time: '0:0', note: 'kick' },
                { time: '0:2', note: 'hat' },
            ],
            'Earth': [
                { time: '0:0', note: 'kick' },
                { time: '0:1', note: 'hat' },
                { time: '0:2', note: 'snare' },
                { time: '0:3', note: 'hat' },
            ],
            'Water': [
                { time: '0:0:0', note: 'kick' }, { time: '0:0:2', note: 'hat' },
                { time: '0:1:0', note: 'hat' }, { time: '0:1:2', note: 'kick' },
                { time: '0:2:0', note: 'snare' }, { time: '0:2:2', note: 'hat' },
                { time: '0:3:0', note: 'hat' }, { time: '0:3:2', note: 'kick' }
            ],
            'Tibet': [
                { time: '0:0', note: 'kick' }, { time: '0:1', note: 'hat_closed' }, 
                { time: '0:1:2', note: 'hat_closed' }, { time: '0:2', note: 'snare' },
                { time: '0:3', note: 'hat_closed' }
            ],
             'Space': [
                { time: '0:0', note: 'kick_echo' },
                { time: '0:2', note: 'snare_verb' }
            ],
            'Toccata': [
                { time: '0:0', note: 'kick_hard' }, { time: '0:1', note: 'snare_hard' },
                { time: '0:2', note: 'kick_hard' }, { time: '0:3', note: 'snare_hard' }
            ],
            'Promenade': [
                { time: '0:0', note: 'kick' }, { time: '0:1', note: 'snare_press' },
                { time: '0:2', note: 'kick' }, { time: '0:3', note: 'snare_press' }
            ],
            'Nocturne': [
                { time: '0:0', note: 'kick_soft' }, { time: '0:2', note: 'snare_soft' },
                { time: '0:3', note: 'hat_open' }
            ],
            'Scherzo': [
                { time: '0:0', note: 'kick' }, { time: '0:0:2', note: 'hat_closed' },
                { time: '0:1', note: 'kick' }, { time: '0:1:2', note: 'hat_closed' },
                { time: '0:2', note: 'snare' }, { time: '0:2:2', note: 'hat_closed' },
                { time: '0:3', note: 'kick' }, { time: '0:3:2', note: 'hat_closed' }
            ],
            'Aria': [
                { time: '0:0', note: 'kick_soft' }, { time: '0:1', note: 'hat_closed' },
                { time: '0:2', note: 'snare_soft' }, { time: '0:3', note: 'hat_closed' },
                { time: '0:3:2', note: 'hat_open' }
            ],
        };

        this.activeVoices = [];

        this.port.onmessage = (e) => {
            const { type, value } = e.data;
            if (type === 'setPattern') {
                this.patternName = value;
                this.step = 0;
                this.nextTickTime = currentTime;
                this.isPlaying = value !== 'Off';
            } else if (type === 'setTempo') {
                this.bpm = value;
            } else if (type === 'stop') {
                this.isPlaying = false;
                this.activeVoices = [];
            }
        };
    }
    
    loadSamples(samples) {
        for (const [name, buffer] of Object.entries(samples)) {
             // The buffer received is an ArrayBuffer, need to convert to Float32Array
            this.samples.set(name, new Float32Array(buffer));
        }
        console.log('[DrumProcessor] Samples loaded:', this.samples.keys());
    }

    process(inputs, outputs, parameters) {
        if (!this.isPlaying) return true;

        const output = outputs[0];
        const bufferSize = output[0].length;
        const tickDuration = 60 / this.bpm / 4; // 16th notes

        // --- Scheduler ---
        while (this.nextTickTime < currentTime + bufferSize / sampleRate) {
            const pattern = this.patterns[this.patternName] || [];
            
            for (const event of pattern) {
                const eventStep = this.timeToStep(event.time);
                if (this.step === eventStep) {
                    const sample = this.samples.get(event.note);
                    if (sample) {
                        this.activeVoices.push({
                            sample: sample,
                            playhead: 0,
                            gain: 0.8
                        });
                    }
                }
            }

            this.step = (this.step + 1) % 16;
            this.nextTickTime += tickDuration;
        }

        // --- Mixer ---
        for (let i = 0; i < bufferSize; i++) {
            let mixedSample = 0;

            for (let v = this.activeVoices.length - 1; v >= 0; v--) {
                const voice = this.activeVoices[v];
                if (voice.playhead < voice.sample.length) {
                    mixedSample += voice.sample[voice.playhead] * voice.gain;
                    voice.playhead++;
                } else {
                    // Remove finished voices
                    this.activeVoices.splice(v, 1);
                }
            }
            output[0][i] = mixedSample;
            // If stereo, copy to the other channel
            if (output.length > 1) {
                output[1][i] = mixedSample;
            }
        }

        return true;
    }

    timeToStep(time) {
        const parts = time.split(':').map(Number);
        return (parts[0] * 16) + (parts[1] * 4) + (parts[2] || 0);
    }
}

registerProcessor('drum-processor', DrumProcessor);
