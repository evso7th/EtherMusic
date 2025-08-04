
# System Analysis: Core Principles of EtherMusic

This document outlines the key architectural principles and data flows of the working version of the EtherMusic application. It serves as a reference point to ensure stability and predictability for future changes.

## 1. Core Engines and Separation of Concerns

The application's logic is cleanly divided into three specialized engines:

- **`AudioEngine` (`src/lib/audio-engine.ts`):** The "heart" of the application, responsible solely for **sound production**.
    - It manages a unified pool of synthesizers (`Voice` instances).
    - It handles real-time audio events from user interaction on the Theremin pads (`startNote`, `updateNote`, `stopNote`).
    - It plays note events received from the `AutopilotEngine`.
    - It contains and controls the `DrumMachine`.
    - It does **not** decide *what* or *when* to play; it only executes playback commands.

- **`AutopilotEngine` (`src/lib/autopilot-engine.ts`):** The "brain" of the automatic music generation.
    - Its primary responsibility is to manage the lifecycle of the music generation logic.
    - It dynamically loads, runs, and communicates with a **single Web Worker** that contains the logic for all autopilot styles.
    - It acts as a bridge, passing UI settings (style, key, scale, tempo, active parts) to the worker and forwarding generated notes from the worker to the `AudioEngine`.

- **`DrumMachine` (`src/lib/drum-machine.ts`):** Manages the rhythm section.
    - It loads high-quality drum samples.
    - It uses `Tone.Part` to schedule and loop drum patterns, ensuring perfect synchronization with the master `Tone.Transport`.

## 2. Autopilot Logic via a Single Web Worker

This is a critical performance and architectural feature.

- **Isolation:** All complex music generation algorithms for every style (`Ambient`, `Toccata`, `Space`, etc.) are located in a **single, dedicated Web Worker file** (`/public/assets/workers/ambient.worker.js`). This prevents the main UI thread from freezing during heavy computations.
- **Dynamic Loading & Modularity:** The `AutopilotEngine` dynamically instantiates the single worker file. It then tells the worker which style to use via `postMessage`. This makes the system modular and easy to extend with new styles (by adding logic within the worker) without touching the core engine.

## 3. Unidirectional Data Flow and UI as the Source of Truth

- **Centralized State:** The main React component, **`src/app/page.tsx`**, holds all the application's state (volumes, tempo, selected instruments, active patterns, switch states) using `useState`. It is the single source of truth.
- **Top-Down Propagation:** When a user changes a setting in the UI, the state is updated in `page.tsx`. Then, `useEffect` hooks watch for these state changes and propagate them down to the appropriate engines via method calls (e.g., `audioEngine.setTempo(newTempo)`). This creates a predictable and debuggable data flow.

## 4. Key Command Chains (Data Flow Examples)

- **Application Start:**
    1. User clicks "Start Meditation" in `page.tsx`.
    2. `handleStartApp` is called.
    3. `initializeAudio()` is called, which creates and initializes the `AudioEngine`.
    4. Inside `audioEngine.initialize()`, `Tone.Transport.start()` is called **once**. This starts the master clock for the entire application.

- **Autopilot Activation:**
    1. User toggles the "Autopilot On/Off" switch in the UI (`page.tsx`).
    2. The `isAutopilotOn` state changes to `true`.
    3. A `useEffect` hook, which depends on `[isAutopilotOn, autopilotStyle]`, is triggered.
    4. It calls `autopilotEngine.current.setAutopilot(true, newStyle)`.
    5. The `AutopilotEngine` loads the worker, sends it the new style (`'setStyle'`), syncs its state (tempo, key, etc.), and sends it a `'start'` message.

- **Note Generation and Playback:**
    1. The active Web Worker generates a musical event (a note or a series of notes) based on the current style.
    2. The worker sends the note data back to the main thread via `self.postMessage({ type: 'playNote', ... })`.
    3. The `AutopilotEngine`'s `onmessage` handler receives the event.
    4. It immediately calls `this.audioEngine.playAutopilotEvent(note, time)`, passing the note to the `AudioEngine`.
    5. The `AudioEngine` finds an available `Voice` from its pool, configures it with the correct instrument preset, and schedules it to play at the precise time.
