
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
    this.nextBeatTime = 0;
    this.beatLengthSeconds = 0; // Duration of one full pattern loop in seconds

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
      const beatsPerMeasure = this.pattern.loop ? this.pattern.length : 4; 
      this.beatLengthSeconds = (60.0 / this.bpm) * beatsPerMeasure;
  }

  setPattern(patternName) {
    if (this.patterns[patternName]) {
      this.pattern = this.patterns[patternName];
      this.step = 0;
      this.updateBeatLength();
      if (this.isPlaying) {
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
    this.step = 0;
    this.nextBeatTime = startTime;
    this.updateBeatLength();
  }

  stop() {
    this.isPlaying = false;
    this.activeVoices = [];
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0][0];
    if (!this.isPlaying || !this.pattern.sequence.length) {
      this.activeVoices = [];
      for (let i = 0; i < output.length; i++) output[i] = 0;
      return true;
    }

    const secondsPerBeat = 60.0 / this.bpm;
    const patternDurationSeconds = this.pattern.length * (this.pattern.loop ? secondsPerBeat : 4 * secondsPerBeat);


    if (currentTime >= this.nextBeatTime) {
      this.pattern.sequence.forEach(patternNote => {
        const noteTime = this.nextBeatTime + (patternNote.time * secondsPerBeat);
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
      this.nextBeatTime += patternDurationSeconds;
    }
    
    // Process and mix active voices
    for (let i = 0; i < output.length; ++i) {
      const frameTime = currentTime + i / sampleRate;
      let sampleValue = 0;

      for (let j = this.activeVoices.length - 1; j >= 0; j--) {
        const voice = this.activeVoices[j];
        
        if (frameTime >= voice.startTime) {
          if (voice.position < voice.sample.length) {
            sampleValue += voice.sample[voice.position] * voice.volume;
            voice.position++;
          } else {
            this.activeVoices.splice(j, 1);
          }
        }
      }
      output[i] = sampleValue;
    }

    return true;
  }
}

registerProcessor('drum-processor', DrumProcessor);
