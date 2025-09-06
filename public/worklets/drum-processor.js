const BEAT_PATTERNS = {
    'Off': [],
    'Air': [
        { time: '0:0:0', note: 'kick', velocity: 1 },
        { time: '0:1:0', note: 'snare', velocity: 0.8 },
        { time: '0:2:0', note: 'kick', velocity: 0.9 },
        { time: '0:3:0', note: 'snare', velocity: 0.7 },
    ],
    'Earth': [
        { time: '0:0:0', note: 'kick', velocity: 1 },
        { time: '0:0:2', note: 'hh_closed', velocity: 0.3 },
        { time: '0:1:0', note: 'hh_closed', velocity: 0.7 },
        { time: '0:1:2', note: 'snare', velocity: 0.6 },
        { time: '0:2:0', note: 'kick', velocity: 0.9 },
        { time: '0:2:2', note: 'hh_closed', velocity: 0.4 },
        { time: '0:3:0', note: 'hh_closed', velocity: 0.7 },
        { time: '0:3:2', note: 'snare', velocity: 0.5 },
    ],
    'Water': [
        { time: '0:0:0', note: 'kick', velocity: 0.8 },
        { time: '0:0:3', note: 'hh_open', velocity: 0.5 },
        { time: '0:1:2', note: 'snare_off', velocity: 0.7 },
        { time: '0:2:1', note: 'kick', velocity: 0.7 },
        { time: '0:3:0', note: 'snare_off', velocity: 0.6 },
        { time: '0:3:3', note: 'hh_open', velocity: 0.4 },
    ],
    'Tibet': [
        { time: '0:0:0', note: 'bowl', velocity: 0.9 },
        { time: '0:2:0', note: 'bowl', velocity: 0.7 },
    ],
    'Space': [
        { time: '0:0:0', note: 'kick_deep', velocity: 1.0 },
        { time: '0:1:0', note: 'snare_spacey', velocity: 0.8 },
        { time: '0:1:3', note: 'hh_open_spacey', velocity: 0.5 },
        { time: '0:2:0', note: 'kick_deep', velocity: 1.0 },
        { time: '0:3:0', note: 'snare_spacey', velocity: 0.7 },
        { time: '0:3:3', note: 'hh_open_spacey', velocity: 0.5 },
    ],
    'Toccata': [
        { time: '0:0:0', note: 'kick', velocity: 1 },
        { time: '0:0:3', note: 'hh_closed', velocity: 0.6 },
        { time: '0:1:0', note: 'snare', velocity: 0.8 },
        { time: '0:1:2', note: 'kick', velocity: 0.7 },
        { time: '0:1:3', note: 'hh_closed', velocity: 0.6 },
        { time: '0:2:0', note: 'kick', velocity: 1 },
        { time: '0:2:3', note: 'hh_closed', velocity: 0.6 },
        { time: '0:3:0', note: 'snare', velocity: 0.8 },
        { time: '0:3:2', note: 'kick', velocity: 0.7 },
        { time: '0:3:3', note: 'hh_closed', velocity: 0.6 },
    ],
    'Promenade': [
        { time: '0:0:0', note: 'kick_heavy', velocity: 1 },
        { time: '0:1:0', note: 'snare_heavy', velocity: 0.8 },
        { time: '0:2:0', note: 'kick_heavy', velocity: 1 },
        { time: '0:3:0', note: 'snare_heavy', velocity: 0.8 },
    ],
    'Nocturne': [
        { time: '0:0:0', note: 'kick_soft', velocity: 0.7 },
        { time: '0:0:2.5', note: 'rim', velocity: 0.5 },
        { time: '0:1:1', note: 'rim', velocity: 0.5 },
        { time: '0:2:0', note: 'kick_soft', velocity: 0.7 },
        { time: '0:2:2', note: 'snare_brush', velocity: 0.6 },
        { time: '0:3:1.5', note: 'rim', velocity: 0.5 },
    ],
    'Scherzo': [
        { time: '0:0:0', note: 'kick', velocity: 0.9 },
        { time: '0:0:2', note: 'hh_closed', velocity: 0.7 },
        { time: '0:1:0', note: 'snare_light', velocity: 0.8 },
        { time: '0:1:2', note: 'hh_closed', velocity: 0.7 },
        { time: '0:2:0', note: 'kick', velocity: 0.9 },
        { time: '0:2:2', note: 'hh_closed', velocity: 0.7 },
        { time: '0:3:0', note: 'snare_light', velocity: 0.8 },
        { time: '0:3:2', note: 'kick', velocity: 0.6 },
    ],
    'Aria': [
        { time: '0:0:0', note: 'kick_soft', velocity: 0.9 },
        { time: '0:1:2', note: 'snare_brush', velocity: 0.7 },
        { time: '0:2:0', note: 'kick_soft', velocity: 0.8 },
        { time: '0:3:2', note: 'snare_brush', velocity: 0.6 },
    ],
};

const DRUM_SAMPLES = {
    kick: '/assets/drums/kick_drum6.wav',
    kick_soft: '/assets/drums/kick_soft.wav',
    kick_heavy: '/assets/drums/kick_heavy.wav',
    kick_deep: '/assets/drums/kick_deep.wav',
    snare: '/assets/drums/snare.wav',
    snare_light: '/assets/drums/snare_light.wav',
    snare_heavy: '/assets/drums/snare_heavy.wav',
    snare_spacey: '/assets/drums/snare_spacey.wav',
    snare_brush: '/assets/drums/snare_brush.wav',
    snare_off: '/assets/drums/snare_off.wav',
    hh_closed: '/assets/drums/closed_hi_hat_accented.wav',
    hh_open: '/assets/drums/open_hh_top2.wav',
    hh_open_spacey: '/assets/drums/hh_open_spacey.wav',
    rim: '/assets/drums/rim.wav',
    bowl: '/assets/drums/bowl.wav',
};

class DrumProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffers = {};
        this.activePatternName = 'Off';
        this.bpm = 90;
        this.isPlaying = false;
        this.nextTickTime = 0;
        this.tickInterval = 240 / this.bpm;
        this.loadSamples();
    }

    async loadSamples() {
        try {
            const promises = Object.entries(DRUM_SAMPLES).map(async ([name, url]) => {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                this.port.postMessage({ type: 'audioData', name, buffer: arrayBuffer });
            });
            await Promise.all(promises);
            this.port.postMessage({ type: 'samplesLoaded' });
        } catch (e) {
            this.port.postMessage({ type: 'loadError', error: e.message });
        }
    }
    
    handleMessage(event) {
        const { type, ...data } = event.data;
        switch (type) {
            case 'start':
                this.isPlaying = true;
                this.nextTickTime = currentTime;
                break;
            case 'stop':
                this.isPlaying = false;
                break;
            case 'setTempo':
                this.bpm = data.bpm;
                this.tickInterval = 240 / this.bpm;
                break;
            case 'setPattern':
                this.activePatternName = data.pattern;
                break;
            case 'audioData':
                this.buffers[data.name] = data.buffer;
                break;
        }
    }

    process(inputs, outputs) {
        if (!this.isPlaying || this.activePatternName === 'Off') {
            return true;
        }

        const pattern = BEAT_PATTERNS[this.activePatternName] || [];

        if (currentTime >= this.nextTickTime) {
            const lookahead = 0.1; // 100ms
            
            pattern.forEach(note => {
                const noteTime = this.parseTime(note.time);
                if (noteTime !== null) {
                    const playTime = this.nextTickTime + noteTime;
                    if (playTime < currentTime + lookahead) {
                        this.port.postMessage({
                            type: 'scheduleNote',
                            note: note.note,
                            time: playTime,
                            velocity: note.velocity,
                        });
                    }
                }
            });
            this.nextTickTime += this.tickInterval;
        }

        return true;
    }

    parseTime(timeStr) {
        if (typeof timeStr !== 'string') return null;
        const parts = timeStr.split(':').map(Number);
        if (parts.some(isNaN)) return null;
        
        const measures = parts[0] || 0;
        const quarters = parts[1] || 0;
        const sixteenths = parts[2] || 0;
        
        const quarterNoteTime = 60 / this.bpm;
        return (measures * 4 * quarterNoteTime) + (quarters * quarterNoteTime) + (sixteenths * quarterNoteTime / 4);
    }
}

registerProcessor('drum-processor', DrumProcessor);
