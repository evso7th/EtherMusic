

class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.samples = {};
    this.patterns = this.getPatterns();
    this.polyphony = options.processorOptions?.polyphony || 16;
    this.activeVoices = [];

    this.bpm = 120;
    this.pattern = this.patterns['Off'];
    this.isPlaying = false;
    this.nextBeatTime = 0;
    this.beatLengthSeconds = (60.0 / this.bpm) * 4; // Default to 4/4 time

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, samples, bpm, startTime, pattern } = event.data;

    switch(type) {
        case 'loadSamples':
            this.loadSamples(samples);
            break;
        case 'start':
            this.start(bpm, startTime);
            break;
        case 'stop':
            this.stop();
            break;
        case 'setBpm':
            this.setBpm(bpm);
            break;
        case 'setPattern':
            this.setPattern(pattern);
            break;
        case 'error':
            console.error('[DRUM WORKLET] Received error from main thread:', event.data.message);
            break;
    }
  }

  loadSamples(samples) {
    try {
      samples.forEach(sample => {
        this.samples[sample.name] = sample.data;
      });
    } catch(e) {
      this.port.postMessage({ type: 'error', message: `Sample loading failed in worklet: ${e.message}` });
    }
  }

  getPatterns() {
    return {
        'Off': { sequence: [], length: 1 },
        'Air': { sequence: [{ time: 0, note: 'k' }, { time: 0.5, note: 'h' }], length: 1 },
        'Earth': { sequence: [{ time: 0, note: 'k' }, { time: 0.5, note: 's' }], length: 1 },
        'Water': { sequence: [{ time: 0, note: 't' }, { time: 0.25, note: 'H' }, { time: 0.5, note: 'T' }, { time: 0.75, note: 'H' }], length: 1 },
        'Tibet': { sequence: [{ time: 0, note: 'l' }, { time: 0.5, note: 'y' }], length: 1 },
        'Space': { sequence: [{ time: 0, note: 'k' }, { time: 0.33, note: 'h' }, { time: 0.66, note: 'y' }], length: 1 },
        'Toccata': { sequence: [
            { time: 0, note: 'k' }, { time: 0.125, note: 'H' }, { time: 0.25, note: 'k' }, { time: 0.375, note: 'H' },
            { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'k' }, { time: 0.875, note: 'H' },
        ], length: 1},
        'Nocturne': { sequence: [
            { time: 0, note: 'k', vol: 0.8 }, { time: 0.25, note: 'H' }, { time: 0.5, note: 's', vol: 0.6 }, { time: 0.625, note: 'H', vol: 0.5 }, { time: 0.75, note: 'H' },
        ], length: 1 },
        'Scherzo': { sequence: [
            { time: 0, note: 'k' }, { time: 0.25, note: 't' }, { time: 0.5, note: 's' }, { time: 0.625, note: 'H' }, { time: 0.75, note: 'T' },
        ], length: 1 },
        'Aria': { sequence: [{ time: 0, note: 'c', vol: 0.7 }, { time: 0.5, note: 'b', vol: 0.9 }], length: 1 },
    };
  }

  updateBeatLength() {
      const secondsPerBeat = 60.0 / this.bpm;
      this.beatLengthSeconds = this.pattern.length * 4 * secondsPerBeat;
  }

  setPattern(patternName) {
    if (this.patterns[patternName]) {
      this.pattern = this.patterns[patternName];
      this.updateBeatLength();
      if (this.isPlaying) {
          // Reset the beat time to the current time to start the new pattern immediately
          this.nextBeatTime = currentTime; 
      }
    }
  }

  setBpm(newBpm) {
    this.bpm = newBpm;
    this.updateBeatLength();
  }

  start(bpm, startTime) {
    this.isPlaying = true;
    this.bpm = bpm;
    // Align start time to the next processing block to ensure sync
    this.nextBeatTime = Math.max(startTime, currentTime);
    this.updateBeatLength();
  }

  stop() {
    this.isPlaying = false;
    this.activeVoices = [];
  }

  process(inputs, outputs, parameters) {
    const outputChannel = outputs[0][0];
    outputChannel.fill(0);
    
    if (!this.isPlaying || !this.pattern.sequence.length) {
        if(this.activeVoices.length > 0) this.activeVoices = []; // Clear voices if stopped
        return true;
    }

    const secondsPerBeat = 60.0 / this.bpm;
    const sampleTime = 1.0 / sampleRate;

    for (let i = 0; i < outputChannel.length; ++i) {
        const frameTime = currentTime + i * sampleTime;
        let sampleValue = 0;

        if (frameTime >= this.nextBeatTime) {
            this.pattern.sequence.forEach(patternNote => {
                const noteTime = this.nextBeatTime + (patternNote.time * 4 * secondsPerBeat);
                const sample = this.samples[patternNote.note];
                if (sample && this.activeVoices.length < this.polyphony) {
                    this.activeVoices.push({
                        sample: sample,
                        position: 0,
                        startTime: noteTime,
                        volume: patternNote.vol || 1.0,
                    });
                }
            });
            this.nextBeatTime += this.beatLengthSeconds;
        }

        for (let j = this.activeVoices.length - 1; j >= 0; j--) {
            const voice = this.activeVoices[j];
              if (voice.position < voice.sample.length) {
                  sampleValue += voice.sample[voice.position] * voice.volume;
                  voice.position++;
              } else {
                  this.activeVoices.splice(j, 1);
              }
        }
        outputChannel[i] = sampleValue;
    }

    return true;
  }
}

registerProcessor('drum-processor', DrumProcessor);
