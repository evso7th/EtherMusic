# System Analysis: Core Principles of EtherMusic

This document outlines the key architectural principles and data flows of the working version of the EtherMusic application. It serves as a reference point to ensure stability and predictability for future changes.

## 1. Core Engines and Separation of Concerns

The application's logic is cleanly divided into specialized engines and components:

- **`AudioEngine` (`src/lib/audio-engine.ts`):** The "heart" of the application, responsible solely for **sound production**.
    - It manages pools of synthesizers (`Voice` instances) for manual play and latch mode.
    - It contains and controls the `DrumMachine`.
    - It manages the `MediaRecorder` for session recording.
    - It does **not** decide *what* to play; it only executes playback commands from user interaction or the drum machine.

- **`DrumMachine` (`src/lib/drum-machine.ts`):** Manages the rhythm section.
    - It loads high-quality drum samples.
    - It uses a custom `setTimeout`-based scheduler to trigger drum patterns, ensuring perfect synchronization with the master clock.

- **`LatchEngine` (`src/lib/latch-engine.ts`):** Manages the "hold" functionality for the bass pad.
    - It tracks active latched notes, up to a maximum of three.
    - It interfaces with the `AudioEngine` to request and release voices from the 'latch' pool.

### Note on Autopilot (AuraGroove)
The previous "Autopilot" functionality, which involved a Web Worker for music generation, has been deprecated in this version and moved to a separate application, **AuraGroove**. The current EtherMusic architecture focuses solely on manual and rhythmic performance.

## 2. Unidirectional Data Flow and UI as the Source of Truth

- **Centralized State:** The main React component, **`src/app/page.tsx`**, holds all the application's state (volumes, tempo, selected instruments, active patterns, switch states) using `useState`. It is the single source of truth.
- **Top-Down Propagation:** When a user changes a setting in the UI, the state is updated in `page.tsx`. Then, `useEffect` hooks watch for these state changes and propagate them down to the `AudioEngine` via method calls (e.g., `audioEngine.setTempo(newTempo)`). This creates a predictable and debuggable data flow.
- **Cookie-Based Persistence:** User preferences for the mixer are saved to browser cookies, allowing settings to persist between sessions if the user consents.

## 3. Key Command Chains (Data Flow Examples)

- **Application Start:**
    1. User clicks "Start Meditation" in `page.tsx`.
    2. `handleStartApp` is called.
    3. `initializeAudio()` is called, which creates and initializes the `AudioEngine`.
    4. Inside `audioEngine.initialize()`, the audio context is resumed and all necessary audio nodes and worklets are prepared.

- **Changing a Beat:**
    1. User selects a new beat pattern in the UI (`beat-box-controls.tsx`).
    2. The `onPatternChange` callback is triggered, which calls `handlePatternChange` in `page.tsx`.
    3. The `activePattern` state is updated, and `setBeatPattern(newPattern.name)` is called.
    4. This calls `audioEngine.current.setBeatPattern(patternName)`, which tells the `DrumMachine` to stop the current loop and start a new one with the selected pattern.

- **Playing a Theremin Note:**
    1. User interacts with a `ThereminPad` component.
    2. The `onInteraction` callback is triggered, sending the note data (`frequency`, `volume`, `state`) to `page.tsx`.
    3. `handleThereminInteraction` in `page.tsx` calls `audioEngine.current.handleThereminInteraction(...)`.
    4. The `AudioEngine` posts a message to the appropriate synth worklet (`melody` or `bass`) to start, update, or stop the note.
