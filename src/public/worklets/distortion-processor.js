// public/worklets/distortion-processor.js

class DistortionWorkletProcessor extends AudioWorkletProcessor {
    
    static get parameterDescriptors() {
        return [{
            name: 'drive',      // The amount of distortion to apply
            defaultValue: 1,    // 1 means no distortion
            minValue: 1,
            maxValue: 200,      // More aggressive range
            automationRate: 'a-rate' // Can be automated smoothly
        }];
    }
    
    constructor() {
        super();
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        const driveValues = parameters.drive;

        for (let channel = 0; channel < input.length; channel++) {
            const inputChannel = input[channel];
            const outputChannel = output[channel];

            if (!inputChannel || !outputChannel) {
                continue;
            }

            for (let i = 0; i < inputChannel.length; i++) {
                const drive = driveValues.length > 1 ? driveValues[i] : driveValues[0];
                const sample = inputChannel[i];
                
                // If drive is at or below 1, pass the signal through unchanged.
                if (drive <= 1.0) {
                    outputChannel[i] = sample;
                    continue;
                }
                
                // Classic atan (arctangent) distortion formula. It's simple and effective.
                // It smoothly clips the signal, creating warm, saturated distortion.
                // The output is scaled back by atan(drive) to keep the volume relatively constant.
                const distortedSample = Math.atan(sample * drive) / Math.atan(drive);

                outputChannel[i] = distortedSample;
            }
        }
        return true; // Keep the processor alive
    }
}

registerProcessor('distortion-processor', DistortionWorkletProcessor);
