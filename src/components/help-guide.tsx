
"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCircle } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { cn } from "@/lib/utils";


const guideContent = `
# EtherMusic Quick Guide

Welcome to EtherMusic! This is a simple guide to get you started on making cool sounds.

## What is This?

It's a virtual music box, a "Neuro Meditation Sound Processor." Think of it as an instrument that anyone can play, regardless of musical ability. You don't need to learn notes or chords. Just move your fingers and listen to what happens.

Our application is at the intersection of a creative tool, a meditation aid, and a digital wellness gadget. It is not for professional musicians, but for a wide audience that appreciates ambient music, mindfulness, and is looking for new forms of self-expression and relaxation.

## The Big Pads (Theremins)

There are two large, glowing pads. They are your main instruments.

*   **How to Play:** Touch a pad with your finger (or click with a mouse).
*   **Left to Right:** Controls the **pitch** (the note you hear).
*   **Up and Down:** Controls the **volume** (how loud the note is).

### Melody Pad (Right, Purple)

*   This is for your main tune. You can play up to three notes at once (it's polyphonic).
*   **Settings:** Use the \`Settings\` button at the top of the pad to open a panel where you can change the **Instrument** (\`synth\`, \`organ\`, etc.), **Music Key**, and **Music Scale** to match your mood.

### Bass Pad (Left, Blue)

*   This is for your bass line. It's polyphonic, so you can play up to three notes at the same time to create chords.
*   **Latch (\`Anchor\` Icon):** "Holds" notes for you. Tap the switch to turn Latch mode on.
    *   **To add a note:** Tap on the pad. A glowing orb will appear. You can have up to three notes latched at once.
    *   **To remove a note:** Tap on an existing orb to stop that specific note.

## Bottom Control Bar

Here you control the rhythm and atmosphere.

*   **Beats:** Choose a pre-made drum pattern or select \`Off\` for no drums.
*   **Tempo:** Select a tempo from a list of descriptive names, from slow \`Largo\` to moderate \`Moderato\`.
*   **Mixer:** This is your command center for sound. Adjust the **Volume**, **Reverb** (space), and **Delay** (echo) for the Melody, Bass, Latch, and Drums separately.

### Autopilot Mode

Don't want to play yourself? Turn on the **Autopilot**!
*   **Autopilot (\`Bot\` Icon):** Turns on the automatic music generator. The app will start creating its own bass and melody lines based on your settings. You can still play along on the melody pad!
*   **Style (\`Wand\` Icon):** When Autopilot is on, this button becomes active. Choose a style to change how the Autopilot generates music:
    *   **Ambient:** Slow, evolving soundscapes.
    *   **House:** Gentle, rhythmic patterns.
    *   **Wind:** Light, airy, and spacious melodies.
    *   **Sequence:** Hypnotic, repeating arpeggios.
    *   **Chimes:** The sound of tinkling glass or metal chimes.
    *   **Drone:** A deep, continuous, and immersive background tone.

## Top Right Controls

*   **Play/Pause:** Starts and stops the master clock, drums, and Autopilot.
*   **Stop:** Stops all sounds immediately.
*   **Record (\`Circle\` Icon):** Press to start recording your session. Press again to stop. Your recording will be downloaded automatically as a \`.webm\` file.

Enjoy the process and let the music you create reflect your inner state.
`;

interface HelpGuideProps extends ButtonProps {
    buttonClassName?: string;
    showText?: boolean;
}

export function HelpGuide({ buttonVariant = "outline", buttonClassName, showText = true, size, ...props }: HelpGuideProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={buttonVariant} size={size || "icon"} className={cn("w-10 h-10", buttonClassName)} {...props}>
                    <HelpCircle className="w-5 h-5" />
                    <span className={cn(
                        "sr-only",
                        showText && "sm:not-sr-only sm:ml-2 sm:inline"
                    )}>
                        Help
                    </span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] md:max-w-xl lg:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Quick Guide</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[70vh] w-full">
                    <div className="prose prose-invert p-4">
                        <ReactMarkdown>{guideContent}</ReactMarkdown>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
