
const patterns = {
    // Meditative Patterns
    'Air': {
        'kick': '1n',
        'hat_closed': null,
        'snare': null,
        'hat_open': '0:2:2'
    },
    'Earth': {
        'kick_hard': ['0:0', '0:2:2'],
        'snare_soft': null,
        'hat': ['0:0:2', '0:1:0', '0:1:2', '0:2:0', '0:3:0', '0:3:2']
    },
    'Water': {
        'kick_soft': '2n',
        'hat': '8n',
        'snare_verb': '0:1:0'
    },
    'Tibet': {
        'kick_echo': '1n',
        'hat': null,
        'snare_verb': ['0:1:2', '0:3:2']
    },
    'Space': {
        'kick': '1n',
        'snare': '0:2',
        'hat_open': '8t'
    },

    // Classic Patterns
    'Toccata': {
        'kick_hard': '4n',
        'snare_hard': '0:2',
        'hat_closed': '8n'
    },
    'Promenade': {
        'kick': '2n',
        'snare_press': ['0:1', '0:3'],
        'hat': '4n'
    },
    'Nocturne': {
        'kick_soft': ['0:0', '0:2:2'],
        'snare_soft': '0:2',
        'hat': '16n'
    },
    'Scherzo': {
        'kick': '4n',
        'snare': ['0:1:2', '0:3:2'],
        'hat_open': '8n'
    },
    'Aria': {
        'kick_echo': '1m',
        'snare_verb': '0:2',
        'hat_open': ['0:0:2', '0:2:2']
    },

    'Off': {},
};


class DrumProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.samples = {};
        this.pattern = {};
        this.bpm = 120;
        this.interval = null;
        this.tick = 0;
        this.sampleRate = options.processorOptions.sampleRate || 44100;
        
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const { type, value, samples } = event.data;
        if (type === 'loadSamples') {
            this.samples = samples;
        } else if (type === 'setPattern') {
            this.setPattern(value);
        } else if (type === 'setTempo') {
            this.setTempo(value);
        } else if (type === 'allNotesOff') {
            this.stop();
        }
    }

    setPattern(patternName) {
        this.stop();
        if (patternName && patterns[patternName] && patternName !== 'Off') {
            this.pattern = this.parsePattern(patterns[patternName]);
            this.start();
        }
    }
    
    setTempo(bpm) {
        this.bpm = bpm;
        if (this.interval !== null) {
            this.stop();
            this.start();
        }
    }

    parsePattern(patternData) {
        const parsed = {};
        // 16 steps for a 4/4 measure in 16th notes
        for (let i = 0; i < 16; i++) {
            parsed[i] = [];
        }

        for (const [instrument, timings] of Object.entries(patternData)) {
            if (!timings) continue;

            const addNote = (time) => {
                const step = Math.round(time.split(':').reduce((acc, t) => (acc * 4) + parseInt(t, 10), 0));
                if (step >= 0 && step < 16) {
                    parsed[step].push(instrument);
                }
            };
            
            const timeToSteps = (unit) => {
                if (unit.endsWith('n')) return 16 / parseInt(unit, 10);
                if (unit.endsWith('t')) return (16 / (parseInt(unit, 10) / 1.5));
                if (unit.endsWith('m')) return 16 * parseInt(unit, 10);
                return 0;
            }

            if (typeof timings === 'string') {
                 if (timings.includes(':')) {
                    addNote(timings);
                } else {
                    // It's an interval like '4n'
                    const interval = timeToSteps(timings);
                    if (interval > 0) {
                        for(let i = 0; i < 16; i += interval) {
                             if (i < 16) parsed[i].push(instrument);
                        }
                    }
                }
            } else if (Array.isArray(timings)) {
                timings.forEach(time => addNote(time));
            }
        }
        return parsed;
    }

    start() {
        this.stop();
        this.tick = 0;
        const tickDuration = 60 / this.bpm / 4; // Duration of a 16th note
        this.interval = setInterval(() => this.scheduleTick(), tickDuration * 1000);
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.tick = 0;
    }

    scheduleTick() {
        const step = this.tick % 16;
        const instrumentsToPlay = this.pattern[step];

        if (instrumentsToPlay && instrumentsToPlay.length > 0) {
            const time = currentTime;
            this.port.postMessage({ type: 'playSamples', instruments: instrumentsToPlay, time });
        }

        this.tick++;
    }

    process(inputs, outputs) {
        // This processor only sends messages, it doesn't process audio itself.
        // It acts as the "brain" for the drum machine.
        // The actual sample playback will be handled by the main thread creating AudioBufferSourceNodes.
        // However, we need to keep the worklet alive.
        return true;
    }
}

registerProcessor('drum-processor', DrumProcessor);
