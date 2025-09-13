// This AudioWorkletProcessor is DEPRECATED and no longer used.
// The 'latch' synth channel now uses the main 'synth-processor.js'.
// This file is kept for historical reference and can be safely removed.
class DeprecatedLatchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = () => {
      // No-op
    };
  }

  process(inputs, outputs, parameters) {
    // Return false to let the processor be garbage-collected.
    return false;
  }
}

registerProcessor('latch-processor', DeprecatedLatchProcessor);
