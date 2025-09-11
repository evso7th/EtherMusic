// This AudioWorkletProcessor is DEPRECATED and no longer used.
// The 'latch' synth channel now uses the main 'synth-processor.js'.
// This file is kept for historical reference but can be safely removed.

class LatchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
        // Log that this processor is deprecated if it's ever used.
        if (event.data.type === 'noteOn') {
            console.error('DEPRECATED: LatchProcessor received a noteOn message. It should not be in use.');
        }
    };
  }

  process() {
    // Return false to signal that this processor can be garbage-collected.
    return false;
  }
}

try {
    registerProcessor('latch-processor', LatchProcessor);
} catch (e) {
    // This will likely fail if another processor with the same name is registered, which is fine.
    // console.log("Could not register deprecated LatchProcessor, which is expected.")
}

    