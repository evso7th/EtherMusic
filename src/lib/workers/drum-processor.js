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
        'Air': { sequence: [{ time: 0, note: 'k' }, { time: 0.5, note: 'H' }], length: 1 },
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
        'Loop 1': { sequence: [{ time: 0, note: 'loop1' }], length: 8, loop: true }, // Assuming 92bpm, 8 beats
        'Loop 2': { sequence: [{ time: 0, note: 'loop2' }], length: 8, loop: true }, // Assuming 110bpm, 8 beats
        'Loop 3': { sequence: [{ time: 0, note: 'loop3' }], length: 8, loop: true }, // Assuming 80bpm, 8 beats
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
    if (!this.isPlaying || this.pattern.length === 0) {
      this.activeVoices = [];
      return true;
    }

    const output = outputs[0][0];
    const secondsPerBeat = 60.0 / this.bpm;
    
    // Check if it's time to schedule the next pattern loop
    if (currentTime >= this.nextTickTime) {
      const patternLengthInBeats = this.pattern.length;
      const loopDurationSeconds = patternLengthInBeats * secondsPerBeat;
      
      this.pattern.sequence.forEach(patternNote => {
        const noteTime = this.nextTickTime + (patternNote.time * secondsPerBeat * (this.pattern.loop ? 1 : patternLengthInBeats));
        
        if (this.samples[patternNote.note] && this.activeVoices.length < this.polyphony) {
          this.activeVoices.push({
            sample: this.samples[patternNote.note],
            position: 0,
            startTime: noteTime,
            volume: patternNote.vol || 1.0,
          });
        }
      });
      
      this.nextTickTime += loopDurationSeconds;
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

    