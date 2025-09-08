
const beatPatterns = {
    'Off': { sequence: [], length: 0 },
    'Air': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:2', note: 'snare' },
        ],
        length: '1m',
        polyphony: 2
    },
    'Earth': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:1', note: 'hatClosed' },
            { time: '0:2', note: 'kick' },
            { time: '0:2', note: 'hatOpen' },
            { time: '0:3', note: 'hatClosed' },
        ],
        length: '1m',
        polyphony: 3
    },
    'Water': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:0:2', note: 'hatClosed' },
            { time: '0:1', note: 'hatClosed' },
            { time: '0:1:2', note: 'hatOpen' },
            { time: '0:2', note: 'kick' },
            { time: '0:2:2', note: 'snare' },
            { time: '0:3', note: 'hatClosed' },
            { time: '0:3:2', note: 'hatOpen' },
        ],
        length: '1m',
        polyphony: 4
    },
     'Tibet': {
        sequence: [
            { time: '0:0', note: 'bowl' },
            { time: '0:2', note: 'gong' },
        ],
        length: '1m',
        polyphony: 2
    },
    'Space': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:2', note: 'snare' },
            { time: '0:3', note: 'kick' }
        ],
        length: '1m',
        polyphony: 2
    },
    'Toccata': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:0:2', note: 'hatClosed' },
            { time: '0:1', note: 'hatClosed' },
            { time: '0:1:2', note: 'hatClosed' },
            { time: '0:2', note: 'snare' },
            { time: '0:2:2', note: 'hatClosed' },
            { time: '0:3', note: 'kick' },
            { time: '0:3:2', note: 'hatClosed' },
        ],
        length: '1m',
        polyphony: 4
    },
    'Promenade': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:2', note: 'snare' },
        ],
        length: '1m',
        polyphony: 2
    },
    'Nocturne': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:1', note: 'hatClosed' },
            { time: '0:2', note: 'snare' },
            { time: '0:3', note: 'hatClosed' },
            { time: '0:3:2', note: 'hatClosed' },
        ],
        length: '1m',
        polyphony: 3
    },
    'Scherzo': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:0:3', note: 'kick' },
            { time: '0:1', note: 'hatClosed' },
            { time: '0:1:2', note: 'snare' },
            { time: '0:2', note: 'kick' },
            { time: '0:2:2', note: 'hatClosed' },
            { time: '0:3', note: 'hatClosed' },
        ],
        length: '1m',
        polyphony: 3
    },
    'Aria': {
        sequence: [
            { time: '0:0', note: 'kick' },
            { time: '0:2', note: 'snare' },
            { time: '0:3', note: 'hatOpen' },
        ],
        length: '1m',
        polyphony: 2
    }
};

class DrumProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.samples = {};
        this.buffers = {};
        this.activeVoices = [];
        this.polyphony = options.processorOptions.polyphony || 8;
        this.loop = null;
        this.bpm = 120;
        this.pattern = beatPatterns.Off;

        this.port.onmessage = (event) => {
            const { type, ...data } = event.data;
            switch (type) {
                case 'load':
                    this.loadSample(data.id, data.path);
                    break;
                case 'start':
                    this.startLoop(data.bpm);
                    break;
                case 'stop':
                    this.stopLoop();
                    break;
                case 'setBpm':
                    this.setBpm(data.bpm);
                    break;
                case 'setPattern':
                    this.setPattern(data.pattern);
                    break;
            }
        };
    }

    async loadSample(id, path) {
        try {
            // Since we can't directly use `fetch` in all worklet environments,
            // this part would typically be handled by the main thread sending an AudioBuffer.
            // For this example, we'll assume the main thread sends us a decoded Float32Array.
            // In a real scenario:
            const response = await fetch(path);
            const arrayBuffer = await response.arrayBuffer();
            this.buffers[id] = arrayBuffer; // This would be decoded on the main thread
             this.port.postMessage({ type: 'loaded', id });
        } catch (e) {
            this.port.postMessage({ type: 'error', message: `Failed to load ${path}` });
        }
    }

    startLoop(bpm) {
        if (this.loop) clearInterval(this.loop);
        this.bpm = bpm;
        const beatDuration = 60 / this.bpm;
        const sixteenthNoteDuration = beatDuration / 4;
        
        let lastTime = currentTime;
        let step = 0;

        this.loop = setInterval(() => {
            const now = currentTime;
            const deltaTime = now - lastTime;
            lastTime = now;
            
            const scheduleAheadTime = 0.1; // 100ms
            
            this.pattern.sequence.forEach(event => {
                const eventTime = this.parseTime(event.time) * beatDuration * 4;
                const playTime = now + scheduleAheadTime + eventTime;

                // This scheduling logic is simplified. A real implementation
                // would need a much more robust scheduler.
                if (playTime > now && playTime < now + (1000/60)) {
                    this.playSample(event.note, playTime);
                }
            });

        }, 1000 / 60); // run at 60Hz
    }
    
    parseTime(time) {
        const parts = time.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) { // 0:0:2 format
            seconds = parts[0] * 4 * (60/this.bpm) + parts[1] * (60/this.bpm) + parts[2] * (60/this.bpm)/2;
        } else if (parts.length === 2) { // 0:2 format
            seconds = parts[0] * 4 * (60/this.bpm) + parts[1] * (60/this.bpm);
        } else {
             seconds = parts[0] * (60/this.bpm);
        }
        return seconds;
    }


    stopLoop() {
        if (this.loop) {
            clearInterval(this.loop);
            this.loop = null;
        }
        this.activeVoices = [];
    }

    setBpm(bpm) {
        this.bpm = bpm;
        if (this.loop) {
            this.stopLoop();
            this.startLoop(bpm);
        }
    }

    setPattern(patternName) {
        this.pattern = beatPatterns[patternName] || beatPatterns.Off;
        if (this.loop) {
            this.stopLoop();
            if (this.pattern.name !== 'Off') {
                this.startLoop(this.bpm);
            }
        }
    }

    playSample(id, time) {
        if (!this.buffers[id]) return;

        if (this.activeVoices.length >= this.polyphony) {
            this.activeVoices.shift();
        }
        
        // This is a simplified playback. In a real worklet, you'd be manipulating
        // the output buffer directly based on the sample data.
        this.port.postMessage({ type: 'playSound', id, time});
    }

    process(inputs, outputs, parameters) {
        // This processor doesn't generate sound itself, it just sends messages
        // to the main thread to play sounds. This is a workaround for the fact
        // that AudioWorklets can't directly load and play back full audio files
        // in a simple way. The main thread will use AudioBufferSourceNode.
        return true;
    }
}

registerProcessor('drum-processor', DrumProcessor);
