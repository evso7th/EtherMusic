
class DistortionProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.drive = 1.0; 
    this.amount = 0.0;
    this.curve = this.createCurve(this.drive);

    this.port.onmessage = (event) => {
      if (event.data.type === 'setDistortion') {
        // We receive amount as 0-100, map it to a more usable drive range.
        // Let's say 1 to 100 for a noticeable effect.
        this.drive = 1.0 + (event.data.amount / 100) * 99;
        this.curve = this.createCurve(this.drive);
      }
    };
  }

  createCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    let i = 0;
    let x;
    for ( ; i < n_samples; ++i ) {
      x = i * 2 / n_samples - 1;
      curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
    }
    return curve;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // If drive is 0, just pass through the signal
    if (this.drive <= 1.0) {
      for (let channel = 0; channel < input.length; channel++) {
        if (input[channel]) {
          output[channel].set(input[channel]);
        }
      }
      return true;
    }

    const waveshaper = this.context.createWaveShaper();
    waveshaper.curve = this.curve;
    waveshaper.oversample = '4x';
    
    const inputNode = this.context.createBufferSource();
    inputNode.buffer = this.context.createBuffer(input.length, input[0].length, this.context.sampleRate);
    
    for (let channel = 0; channel < input.length; channel++) {
        inputNode.buffer.copyToChannel(input[channel], channel);
    }
    
    const wetGain = this.context.createGain();
    const dryGain = this.context.createGain();

    // This is a simple interpretation. The 'amount' property is not used here directly
    // but the `drive` is set via messages.
    // A more complex implementation could use an AudioParam for 'amount'.
    // For now, we'll treat distortion as 'all or nothing' based on the drive value.
    // Let's fake a dry/wet mix. `this.drive` comes from the message.
    // Let's use it as a proxy for a 'wet' amount.
    const wetAmount = (this.drive - 1) / 99; // Remap from 1-100 to 0-1
    wetGain.gain.value = wetAmount;
    dryGain.gain.value = 1 - wetAmount;


    // This processing logic is incorrect for a worklet.
    // AudioNodes cannot be created inside the process() method.
    // Let's refactor this to do the math directly.
    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];
        // Apply waveshaping curve manually
        // The value from the curve is an index lookup, which is not efficient.
        // A direct mathematical function is better.
        const k = this.drive;
        // The classic waveshaper formula
        const distortedSample = ( 3 + k ) * sample * 20 * (Math.PI / 180) / ( Math.PI + k * Math.abs(sample) );
        // Simple dry/wet mix. We'll use the 'amount' from the constructor/message.
        // Let's assume amount is 0-1, so we'll map from 0-100
        const mix = (this.drive - 1) / 99;
        outputChannel[i] = (distortedSample * mix) + (sample * (1-mix));
      }
    }

    return true;
  }
}


class DistortionWorkletProcessor extends AudioWorkletProcessor {
    
    drive = 1;
    
    static get parameterDescriptors() {
        return [{
            name: 'drive',
            defaultValue: 1,
            minValue: 1,
            maxValue: 100,
            automationRate: 'a-rate'
        }];
    }
    
    constructor(options) {
        super(options);
        // We can't access context here, so curve generation on the fly is tricky.
        // We'll use a mathematical formula directly in process().
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        const driveValues = parameters.drive;

        for (let channel = 0; channel < input.length; channel++) {
            const inputChannel = input[channel];
            const outputChannel = output[channel];

            for (let i = 0; i < inputChannel.length; i++) {
                const drive = driveValues.length > 1 ? driveValues[i] : driveValues[0];
                const sample = inputChannel[i];
                
                if (drive <= 1.01) { // Add a small tolerance
                    outputChannel[i] = sample; // Pass through if no distortion
                    continue;
                }
                
                // Classic waveshaper formula
                const k = drive;
                const wetSample = (Math.PI + k) * sample * (1 / (Math.PI + k * Math.abs(sample)));

                // This formula can clip harshly, so let's soften it.
                // A simpler formula: a atan curve
                const wetSampleAtan = Math.atan(sample * k) / (Math.PI / 2);

                outputChannel[i] = wetSampleAtan;
            }
        }
        return true;
    }
}


registerProcessor('distortion-processor', DistortionWorkletProcessor);
