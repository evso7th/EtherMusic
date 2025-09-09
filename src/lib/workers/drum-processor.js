
class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.samples = {};
    this.patterns = this.getPatterns();
    this.polyphony = options.processorOptions?.polyphony || 16;
    this.activeVoices = [];

    this.bpm = 120;
    this.pattern = this.patterns['Off'];
    this.step = 0;
    this.isPlaying = false;
    this.nextTickTime = 0;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, payload } = event.data;
    switch(type) {
        case 'loadSamples':
            this.loadSamples(event.data.samples);
            break;
        case 'start':
            this.start(event.data.bpm, event.data.startTime);
            break;
        case 'stop':
            this.stop();
            break;
        case 'setBpm':
            this.setBpm(event.data.bpm);
            break;
        case 'setPattern':
            this.setPattern(event.data.pattern);
            break;
        case 'error':
             // Forward error to main thread for logging
            console.error('[DRUM WORKLET] Received error from main thread:', event.data.message);
            break;
    }
  }

  loadSamples(samples) {
    try {
      samples.forEach(sample => {
        // The sample data is already a Float32Array from the main thread
        this.samples[sample.name] = sample.data;
      });
    } catch(e) {
      this.port.postMessage({ type: 'error', message: `Sample loading failed in worklet: ${e.message}` });
    }
  }

  getPatterns() {
    return {
        'Off': [],
        'Air': [
            { time: 0, note: 'k' },
            { time: 0.5, note: 'H' },
        ],
        'Earth': [
            { time: 0, note: 'k' },
            { time: 0.5, note: 's' },
        ],
        'Water': [
            { time: 0, note: 't' },
            { time: 0.25, note: 'H' },
            { time: 0.5, note: 'T' },
            { time: 0.75, note: 'H' },
        ],
        'Tibet': [
            { time: 0, note: 'l' },
            { time: 0.5, note: 'y' },
        ],
        'Space': [
            { time: 0, note: 'k' },
            { time: 0.33, note: 'h' },
            { time: 0.66, note: 'y' },
        ],
        'Toccata': [
            { time: 0, note: 'k' }, { time: 0.125, note: 'H' }, { time: 0.25, note: 'k' }, { time: 0.375, note: 'H' },
            { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'k' }, { time: 0.875, note: 'H' },
        ],
        'Nocturne': [
            { time: 0, note: 'k', vol: 0.8 }, { time: 0.25, note: 'H' }, { time: 0.5, note: 's', vol: 0.6 }, { time: 0.625, note: 'H', vol: 0.5 }, { time: 0.75, note: 'H' },
        ],
        'Scherzo': [
            { time: 0, note: 'k' }, { time: 0.25, note: 't' }, { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'T' },
        ],
        'Aria': [
            { time: 0, note: 'c', vol: 0.7 }, { time: 0.5, note: 'b', vol: 0.9 }
        ],
    };
  }

  setPattern(patternName) {
    if (this.patterns[patternName]) {
      this.pattern = this.patterns[patternName];
      this.step = 0; // Reset step on pattern change
    }
  }

  setBpm(newBpm) {
    this.bpm = newBpm;
  }

  start(bpm, startTime) {
    this.isPlaying = true;
    this.bpm = bpm;
    this.step = 0;
    this.nextTickTime = startTime;
  }

  stop() {
    this.isPlaying = false;
    this.activeVoices = []; // Clear active voices
  }

  process(inputs, outputs, parameters) {
    if (!this.isPlaying) return true;

    const output = outputs[0][0];
    const secondsPerBeat = 60.0 / this.bpm;
    const beatDurationInSamples = secondsPerBeat * sampleRate;
    
    // Looping through the output buffer
    for (let i = 0; i < output.length; ++i) {
        if (currentTime >= this.nextTickTime) {
            this.pattern.forEach(patternNote => {
                // Schedule notes based on the beat
                const noteTime = this.nextTickTime + patternNote.time * beatDurationInSamples;
                if(this.samples[patternNote.note] && this.activeVoices.length < this.polyphony) {
                    this.activeVoices.push({
                        sample: this.samples[patternNote.note],
                        position: 0,
                        volume: patternNote.vol || 1.0,
                    });
                }
            });

            this.step++;
            this.nextTickTime += beatDurationInSamples; // Move to the next beat
        }
        
        let sample = 0;
        // Mix active voices
        for (let j = this.activeVoices.length - 1; j >= 0; j--) {
            const voice = this.activeVoices[j];
            if (voice.position < voice.sample.length) {
                sample += voice.sample[voice.position] * voice.volume;
                voice.position++;
            } else {
                this.activeVoices.splice(j, 1); // Remove finished voice
            }
        }
        output[i] = sample;
    }

    return true;
  }
}

registerProcessor('drum-processor', DrumProcessor);

    