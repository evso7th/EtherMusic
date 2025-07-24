
"use client";

import { Button } from "@/components/ui/button";
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

It's a virtual music box. You have two main touch pads (Theremins) for creating melodies and a beatbox for rhythm.

## The Big Pads (Theremins)

There are two large, glowing pads. They are your main instruments.

*   **How to Play:** Touch a pad with your finger (or click with a mouse).
*   **Left to Right:** Controls the **pitch** (the note you hear).
*   **Up and Down:** Controls the **volume** (how loud the note is).

### Melody Pad (Right, Purple)

*   This is for your main tune.
*   You can play multiple notes at the same time (polyphonic).
*   **Change Instrument:** Use the dropdown menu at the top of the pad to switch between sounds like \`synth\`, \`organ\`, \`theremin\`, or \`glass\`.

### Bass Pad (Left, Blue)

*   This is for your bass line. It only plays one note at a time.
*   **Pulsate (\`Zap\` Icon):** Makes the sound throb in time with the beat. It's great for rhythmic bass.
*   **Latch (\`Anchor\` Icon):** "Holds" a note for you. Tap the switch to turn Latch mode on. Then, tap on the pad to start a note, and tap again to stop it. No need to hold your finger down.

## Bottom Control Bar

Here you control the rhythm section.

*   **Beats:** Tap this to open a menu and choose a pre-made drum pattern (\`Rock\`, \`House\`, etc.). Select \`Off\` to have no drums.
*   **Tempo:** Tap this to open a slider that changes the speed of the beat (BPM - Beats Per Minute).
*   **Mixer:** Tap this to open the volume controls. You can adjust the volume for the **Melody**, **Bass**, and **Drums** separately.

## Top Right Controls

*   **Play/Pause:** Starts and stops the master clock and the drum sequence.
*   **Stop:** Stops all sounds immediately.
*   **Record (\`Mic\` Icon):** Press it to start recording your session. Press it again to stop. Your recording will be downloaded automatically as a \`.webm\` file.

Enjoy the process and let the music you create reflect your inner state.
`;

interface HelpGuideProps {
    buttonVariant?: "outline" | "link" | "default" | "destructive" | "secondary" | "ghost" | null | undefined;
    buttonClassName?: string;
}

export function HelpGuide({ buttonVariant = "outline", buttonClassName }: HelpGuideProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={buttonVariant} size="icon" className={cn("w-10 h-10 rounded-full", buttonClassName)}>
                    <HelpCircle className="w-5 h-5" />
                    <span className="sr-only sm:not-sr-only sm:ml-2 hidden sm:inline">Help</span>
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
