
**Title: How we killed the audio crackle in our Web Audio app: A journey through 3 failed architectures.**

---

Hey /r/webdev,

We just went through a brutal but rewarding journey building a generative ambient music app ([EtherMusic](https://ethermusic.app/)) and wanted to share the story of our fight against our arch-nemesis: **the audio crackle**. If you've ever worked with the Web Audio API, you know what I'm talking about. We hit every single wall, so maybe our story can save you some time.

### The Dream: A Smooth, Meditative Audio Experience in the Browser

The goal was simple: a neuro-meditation sound processor that anyone could use. It had to be smooth, responsive, and work flawlessly even on a 5-year-old phone. Sounds easy, right? *Right?*

### Architecture 1 (The Naive Start): The `Tone.PolySynth` Trap

Like many, we started with `Tone.js`. And `Tone.PolySynth` looks like a gift from the heavens. It promises to handle all the complex voice allocation for you. We built our first prototype with it.

**The Reality:** It worked... on a powerful desktop. On a mobile device, as soon as you played more than a couple of notes, the **Crackle Dragon** appeared. Clicks, pops, and stutters. `PolySynth`, for all its convenience, adds a significant layer of overhead. For a performance-critical app, it was a no-go.

**Mistake #1:** Assuming a high-level abstraction (`PolySynth`) would be performant enough for our core feature.

### Architecture 2 (The "Idiotic" Detour): A New Synth For Every Note

Okay, `PolySynth` is out. What's the "pro" way? Individual synths! So we tried what seemed logical:
1.  User presses a note.
2.  Create a `new Tone.Synth()`.
3.  Play the note.
4.  When the note is released, call `.dispose()` on the synth.

**The Reality:** This was so, so much worse. We had slain the Crackle Dragon only to be swarmed by its children: the **Garbage Collector Goblins**. Creating and destroying audio nodes in real-time is incredibly expensive. The UI would lock up, and the audio glitches were even more horrific.

**Mistake #2:** Churning objects in the audio loop. The garbage collector can't keep up, and it causes massive performance hits.

### Architecture 3 (Getting Warmer): The Monosynth Pool

This is where we started to get it right. The industry-standard approach is a **pool of pre-allocated synths**.
1.  On startup, create a fixed number of `Tone.Synth` instances (e.g., 8 voices) and keep them in an array (our "pool").
2.  When a note needs to be played, find an available (not busy) synth in the pool.
3.  Use it to play the note.
4.  When the note is released, the synth is marked as "available" again. **It is never destroyed.**

**The Reality:** This was a game-changer for manual playing. The sound was crystal clear. The Crackle Dragon was gone, the GC Goblins were banished. We had won!

...but we had forgotten about our Autopilot feature.

### Architecture 4 (The Final Boss): The Tyranny of the Main Thread

Our app has an "Autopilot" that generates complex musical phrases. And all that generation logic was running in the **main UI thread**.

**The Reality:** As soon as the Autopilot started thinking (calculating the next phrase), the entire app would freeze. Animations stopped. The UI became unresponsive. We had defeated the audio glitches only to introduce **The UI Freeze**.

**Mistake #3:** Running heavy, continuous calculations on the main thread. The browser can't draw frames and run your complex `for` loops at the same time.

### The Final, Victorious Architecture: The Web Worker Exodus

This was the final, liberating step.
1.  **Isolate the Brain:** We moved ALL the music generation logic—every single algorithm for every style—into a dedicated **Web Worker**. The main thread's only job now is UI updates and *executing* audio commands.
2.  **Become the Conductor:** The main thread no longer thinks about *what* to play. It just receives commands from the Worker like `(playNote, {note: 'C4', time: ...})` and passes them to the `AudioEngine`.
3.  **Bonus - Batching:** To avoid flooding the main thread with `postMessage` calls, the Worker batches notes together. Instead of sending 16 individual messages for an arpeggio, it sends one message with an array of 16 notes.

**The Result:** Perfect, buttery-smooth performance. The UI is 100% responsive, no matter how complex the music generation gets. The audio is crystal clear. We finally achieved our dream.

---

**TL;DR:**
*   **Don't use `Tone.PolySynth`** for serious apps. Use a **pool** of reusable `Tone.Synth` instances.
*   **NEVER** create/destroy audio nodes in a real-time loop.
*   Move **ALL** heavy, continuous logic (like music generation) to a **Web Worker**. Don't let the main thread "think". It should only react to UI and execute commands.
*   **Batch** messages from your Worker to the main thread to reduce overhead.

It was a painful journey, but we learned a ton. Hope this helps someone else avoid our mistakes! You can feel the result of our efforts at [https://ethermusic.app/](https://ethermusic.app/).

The path to victory is thorny, but it is achievable. Persistence and a clear vision of the end result. This is what's important.
