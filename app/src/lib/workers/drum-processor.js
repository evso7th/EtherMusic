

class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.samples = {};
    this.polyphony = options.processorOptions?.polyphony || 16;
    this.activeVoices = [];

    this.bpm = 120;
    this.pattern = { sequence: [], length: 1 };
    this.isPlaying = false;
    this.nextBeatTime = 0;
    this.secondsPerBeat = 60.0 / this.bpm;
    this.beatLengthSeconds = this.pattern.length * 4 * this.secondsPerBeat;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, payload } = event.data;

    switch(type) {
        case 'loadSamples':
            this.loadSamples(payload);
            break;
        case 'start':
            this.start(payload.bpm, payload.startTime);
            break;
        case 'stop':
            this.stop();
            break;
        case 'setBpm':
            this.setBpm(payload.bpm);
            break;
        case 'setPattern':
            this.setPattern(payload.pattern);
            break;
        case 'error': // For completeness, though we send errors from here
            console.error('[DRUM WORKLET] Received error from main thread:', payload.message);
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

  updateBeatLength() {
      this.secondsPerBeat = 60.0 / this.bpm;
      this.beatLengthSeconds = this.pattern.length * 4 * this.secondsPerBeat;
  }

  setPattern(newPattern) {
    if (newPattern) {
      this.pattern = newPattern;
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
    
    if (!this.isPlaying || !this.pattern || !this.pattern.sequence || this.pattern.sequence.length === 0) {
        if(this.activeVoices.length > 0) this.activeVoices = []; // Clear voices if stopped
        return true;
    }

    const sampleTime = 1.0 / sampleRate;

    for (let i = 0; i < outputChannel.length; ++i) {
        const frameTime = currentTime + i * sampleTime;
        let sampleValue = 0;

        if (frameTime >= this.nextBeatTime) {
            this.pattern.sequence.forEach(patternNote => {
                const noteTime = this.nextBeatTime + (patternNote.time * 4 * this.secondsPerBeat);
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
              // This logic for playing back the sample needs to be frame-accurate.
              // A simple counter is sufficient here as we're not dealing with pitch.
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

    