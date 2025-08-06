# System Analysis: Core Principles of EtherMusic

This document outlines the key architectural principles and data flows of the working version of the EtherMusic application. It serves as a reference point to ensure stability and predictability for future changes.

## 1. Core Engines and Separation of Concerns

The application's logic is cleanly divided into specialized engines and components:

- **`AudioEngine` (`src/lib/audio-engine.ts`):** The "heart" of the application, responsible solely for **sound production**.
    - It manages pools of synthesizers (`Voice` instances) for manual play and latch mode.
    - It creates and manages dedicated synths for each part of the Autopilot.
    - It handles real-time audio events from user interaction on the Theremin pads (`startNote`, `updateNote`, `stopNote`).
    - It plays note events received from the `autopilot-worker.ts`.
    - It contains and controls the `DrumMachine`.
    - It manages the `MediaRecorder` for session recording.
    - It does **not** decide *what* or *when* to play; it only executes playback commands.

- **`autopilot-worker.ts` (`src/lib/autopilot-worker.ts`):** The "brain" of the automatic music generation.
    - It runs in a completely separate thread, ensuring the UI never freezes.
    - It contains all the logic for every autopilot style (`Ambient`, `Toccata`, `Space`, etc.).
    - It acts as a composer, receiving settings (style, key, scale, tempo) from the main thread and sending back precisely timed note events.
    - This is a critical performance and architectural feature.

- **`DrumMachine` (`src/lib/drum-machine.ts`):** Manages the rhythm section.
    - It loads high-quality drum samples.
    - It uses `Tone.Part` to schedule and loop drum patterns, ensuring perfect synchronization with the master `Tone.Transport`.

- **`LatchEngine` (`src/lib/latch-engine.ts`):** Manages the "hold" functionality for the bass pad.
    - It tracks active latched notes, up to a maximum of three.
    - It interfaces with the `AudioEngine` to request and release voices from the 'latch' pool.

## 2. Unidirectional Data Flow and UI as the Source of Truth

- **Centralized State:** The main React component, **`src/app/page.tsx`**, holds all the application's state (volumes, tempo, selected instruments, active patterns, switch states) using `useState`. It is the single source of truth.
- **Top-Down Propagation:** When a user changes a setting in the UI, the state is updated in `page.tsx`. Then, `useEffect` hooks watch for these state changes and propagate them down to the appropriate engines via method calls (e.g., `audioEngine.setTempo(newTempo)` or `worker.postMessage(...)`). This creates a predictable and debuggable data flow.
- **Cookie-Based Persistence:** User preferences for the mixer and autopilot presets are saved to browser cookies, allowing settings to persist between sessions if the user consents.

## 3. Key Command Chains (Data Flow Examples)

- **Application Start:**
    1. User clicks "Start Meditation" in `page.tsx`.
    2. `handleStartApp` is called.
    3. `initializeAudio()` is called, which creates and initializes the `AudioEngine` and the `autopilot-worker`.
    4. Inside `audioEngine.initialize()`, `Tone.Transport.start()` is called **once**. This starts the master clock for the entire application.

- **Autopilot Activation:**
    1. User toggles the "Autopilot On/Off" switch in the UI (`page.tsx`).
    2. The `isAutopilotOn` state changes to `true`.
    3. `autopilotWorker.current.postMessage({ type: 'start' })` is called.
    4. The worker sets its internal `isRunning` flag to `true`.

- **Note Generation and Playback:**
    1. The active Web Worker generates a musical event (a note or a series of notes) based on the current style.
    2. The worker sends the note data back to the main thread via `self.postMessage({ type: 'playNote', ... })`.
    3. The `onmessage` handler in `page.tsx` receives the event.
    4. It immediately calls `audioEngine.current.playWorkerNote(note)`, passing the note to the `AudioEngine`.
    5. The `AudioEngine` uses the dedicated synth for that autopilot part to schedule the note to play at the precise time.

- **Saving an Autopilot Preset:**
    1. User clicks "Save Preset" in the Autopilot dialog in `beat-box-controls.tsx`.
    2. The `onSavePreset` callback is triggered, which calls `handleSaveAutopilotPreset` in `page.tsx`.
    3. `handleSaveAutopilotPreset` gathers the current autopilot-related state (instruments, volumes, effects) into a preset object.
    4. The preset object is saved to a cookie, keyed by the active autopilot style name.
