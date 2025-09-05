// public/worklets/drum-processor.js

class DrumProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.samples = {};
        this.patterns = this.getPatterns();
        this.activePattern = [];
        this.bpm = 120;
        this.step = 0;
        this.lastTickTime = currentTime;
        this.isPlaying = false;
        
        // Convert transferable ArrayBuffers back to Float32Arrays
        if (options.processorOptions && options.processorOptions.samples) {
            for (const [name, data] of Object.entries(options.processorOptions.samples)) {
                this.samples[name] = new Float32Array(data.buffer);
            }
        }
        
        this.port.onmessage = (e) => this.handleMessage(e.data);
    }
    
    getPatterns() {
        return {
             'Off': [],
            'Air': [
                { time: '0:0:0', instrument: 'kick_soft' },
                { time: '0:2:0', instrument: 'kick_soft' },
            ],
            'Earth': [
                { time: '0:0:0', instrument: 'kick' },
                { time: '0:1:0', instrument: 'hat_closed' },
                { time: '0:1:2', instrument: 'hat_closed' },
                { time: '0:2:0', instrument: 'kick' },
                { time: '0:2:2', instrument: 'snare_soft' },
                { time: '0:3:0', instrument: 'hat_closed' },
                { time: '0:3:2', instrument: 'hat_closed' },
            ],
            'Water': [
                { time: '0:0:0', instrument: 'kick_echo' },
                { time: '0:0:3', instrument: 'hat' },
                { time: '0:1:2', instrument: 'hat' },
                { time: '0:2:1', instrument: 'hat' },
                { time: '0:3:0', instrument: 'hat' },
                { time: '0:3:3', instrument: 'snare_verb' },
            ],
            'Tibet': [
                { time: '0:0:0', instrument: 'kick' },
                { time: '0:1:0', instrument: 'snare_press' },
                { time: '0:2:0', instrument: 'kick_hard' },
                { time: '0:3:0', instrument: 'snare_press' },
                { time: '0:3:2', instrument: 'hat_open' },
            ],
            'Space': [
                 { time: '0:0:0', instrument: 'kick_echo' },
                 { time: '0:2:0', instrument: 'kick_echo' },
            ],
            'Toccata': [
                { time: '0:0:0', instrument: 'kick_hard' },
                { time: '0:0:2', instrument: 'hat_closed' },
                { time: '0:1:0', instrument: 'snare_hard' },
                { time: '0:1:2', instrument: 'hat_closed' },
                { time: '0:2:0', instrument: 'kick_hard' },
                { time: '0:2:2', instrument: 'hat_closed' },
                { time: '0:3:0', instrument: 'snare_hard' },
                { time: '0:3:2', instrument: 'hat_closed' },
            ],
             'Promenade': [
                { time: '0:0:0', instrument: 'kick' },
                { time: '0:1:0', instrument: 'hat_closed' },
                { time: '0:2:0', instrument: 'snare_soft' },
                { time: '0:3:0', instrument: 'hat_closed' },
            ],
             'Nocturne': [
                { time: '0:0:0', instrument: 'kick_soft' },
                { time: '0:1:0', instrument: 'snare_press' },
                { time: '0:2:0', instrument: 'kick_soft' },
                { time: '0:3:0', instrument: 'snare_press' },
            ],
             'Scherzo': [
                { time: '0:0:0', instrument: 'kick' },
                { time: '0:0:2', instrument: 'hat' },
                { time: '0:1:0', instrument: 'snare' },
                { time: '0:1:2', instrument: 'hat' },
                { time: '0:2:0', instrument: 'kick' },
                { time: '0:2:2', instrument: 'hat' },
                { time: '0:3:0', instrument: 'snare' },
                { time: '0:3:2', instrument: 'hat_open' },
            ],
            'Aria': [
                { time: '0:0', instrument: 'kick_soft' },
                { time: '0:1', instrument: 'hat' },
                { time: '0:2', instrument: 'kick_soft' },
                { time: '0:2:2', instrument: 'snare_soft' },
                { time: '0:3', instrument: 'hat' },
            ],
        };
    }
    
    handleMessage(message) {
        if (message.type === 'setPattern') {
            this.activePattern = this.patterns[message.value] || [];
            this.step = 0;
            this.isPlaying = message.value !== 'Off';
            this.lastTickTime = currentTime;
        } else if (message.type === 'setTempo') {
            this.bpm = message.value;
        } else if (message.type === 'allNotesOff') {
            this.isPlaying = false;
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.isPlaying) return true;

        const output = outputs[0];
        const bufferSize = output[0].length;
        const secondsPerBeat = 60.0 / this.bpm;
        const secondsPerStep = secondsPerBeat / 4; // 16th notes
        
        let timeElapsed = (currentTime - this.lastTickTime);

        for (let i = 0; i < bufferSize; i++) {
            const frameTime = currentTime + i / sampleRate;
            
            if (timeElapsed >= secondsPerStep) {
                timeElapsed -= secondsPerStep;
                this.step = (this.step + 1) % 16;

                for (const note of this.activePattern) {
                    const [bar, beat, sixteenth] = note.time.split(':').map(Number);
                    const noteStep = (beat * 4) + (sixteenth || 0);

                    if (this.step === noteStep) {
                        this.playSample(note.instrument, output, i);
                    }
                }
            }
        }

        this.lastTickTime += bufferSize / sampleRate;

        // Keep the worklet alive
        return true;
    }

    playSample(instrumentName, output, frameOffset) {
        const sample = this.samples[instrumentName];
        if (!sample) return;

        // Simple playback, no volume control for now
        const leftChannel = output[0];
        const rightChannel = output[1];

        for (let i = 0; i < sample.length; i++) {
            if (frameOffset + i < leftChannel.length) {
                leftChannel[frameOffset + i] += sample[i];
                rightChannel[frameOffset + i] += sample[i];
            }
        }
    }
}

registerProcessor('drum-processor', DrumProcessor);
