// This file is obsolete.
// The latching logic is now managed directly inside the poly-synth-processor AudioWorklet,
// controlled by messages from the AudioEngine. This simplifies the main thread and
// keeps state closer to where it's used.
export {};
