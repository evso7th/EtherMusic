// This AudioWorkletProcessor is DEPRECATED and no longer used.
// The 'latch' synth channel now uses the main 'synth-processor.js'.
// This file is kept for historical reference and can be safely removed.

// To avoid breaking builds if it's still referenced somewhere unexpectedly,
// we register a dummy processor.
try {
    registerProcessor('latch-processor', class LatchProcessor extends AudioWorkletProcessor {
        process() {
            // Return false to signal that this processor can be garbage-collected.
            return false;
        }
    });
} catch (e) {
    // This will likely fail if another processor with the same name is registered, 
    // or if this code is run in an environment without `registerProcessor`. That's fine.
}

    