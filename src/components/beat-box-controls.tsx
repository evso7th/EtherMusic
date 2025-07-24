
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { MixerControls } from '@/components/mixer-controls';
import { SlidersHorizontal, Drum, Zap, HelpCircle } from 'lucide-react';
import { useState } from "react";
import { cn } from "@/lib/utils";
import { HelpGuide } from "./help-guide";


type BeatPattern = {
    name: string;
    sequence: (string | null)[];
};

interface BeatBoxControlsProps {
    patterns: BeatPattern[];
    activePattern: BeatPattern;
    onPatternChange: (pattern: BeatPattern) => void;
    tempo: number;
    onTempoChange: (tempo: number) => void;
    volumes: { melody: number; bass: number; drums: number };
    onVolumeChange: (volumes: { melody: number; bass: number; drums: number; }) => void;
}

export function BeatBoxControls({
    patterns,
    activePattern,
    onPatternChange,
    tempo,
    onTempoChange,
    volumes,
    onVolumeChange,
}: BeatBoxControlsProps) {
    const [isBeatsOpen, setIsBeatsOpen] = useState(false);
    const [isTempoOpen, setIsTempoOpen] = useState(false);

    return (
        <Card className="bg-card/50">
            <CardContent className="p-2 md:p-4 flex justify-around items-center gap-2">
                <Dialog open={isBeatsOpen} onOpenChange={setIsBeatsOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="flex-1">
                            <Drum className="w-4 h-4 md:mr-2" />
                            <span className="hidden sm:inline">Beats</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Beat Patterns</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-2 py-4">
                            {patterns.map((pattern) => (
                                <Button
                                    key={pattern.name}
                                    variant={activePattern.name === pattern.name ? 'default' : 'outline'}
                                    onClick={() => {
                                        onPatternChange(pattern);
                                        setIsBeatsOpen(false);
                                    }}
                                >
                                    {pattern.name}
                                </Button>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>

                <Dialog open={isTempoOpen} onOpenChange={setIsTempoOpen}>
                    <DialogTrigger asChild>
                         <Button variant="outline" className="flex-1">
                            <Zap className="w-4 h-4 md:mr-2" />
                            <span className="hidden sm:inline">Tempo</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Adjust Tempo</DialogTitle>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                             <div className="flex-grow flex items-center gap-4">
                                <Slider
                                    id="tempo"
                                    min={60}
                                    max={240}
                                    step={1}
                                    value={[tempo]}
                                    onValueChange={(value) => onTempoChange(value[0])}
                                    className="w-full"
                                />
                                <span className="text-lg font-mono w-16 text-center p-2 rounded-md bg-muted">{tempo}</span>
                            </div>
                            <DialogClose asChild>
                                <Button className="w-full">Done</Button>
                            </DialogClose>
                        </div>
                    </DialogContent>
                </Dialog>

                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="flex-1 px-2 md:px-4">
                            <SlidersHorizontal className="w-4 h-4 md:mr-2"/>
                             <span className="hidden sm:inline">Mixer</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Mixer</DialogTitle>
                        </DialogHeader>
                        <MixerControls volumes={volumes} onVolumeChange={onVolumeChange} />
                    </DialogContent>
                </Dialog>

                <HelpGuide buttonVariant="outline" buttonClassName="flex-1" />
            </CardContent>
        </Card>
    );
}
