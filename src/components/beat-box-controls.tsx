
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MixerControls } from '@/components/mixer-controls';
import { SlidersHorizontal } from 'lucide-react';


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
    return (
        <Card className="bg-card/50">
            <CardContent className="p-2 md:p-6 flex flex-col md:flex-row items-center gap-2 md:gap-6 h-full">
                <div className="flex-shrink-0 w-full md:w-auto">
                    <Label className="text-sm font-bold mb-2 hidden md:block">Beat Box</Label>
                    <div className="flex flex-wrap gap-1 md:gap-2 justify-center">
                        {patterns.map((pattern) => (
                            <Button
                                key={pattern.name}
                                variant={activePattern.name === pattern.name ? 'default' : 'outline'}
                                onClick={() => onPatternChange(pattern)}
                                size="sm"
                                className="text-xs md:text-sm h-8 md:h-9"
                            >
                                {pattern.name}
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="w-full md:w-auto flex-grow flex items-center gap-2 md:gap-4 px-2">
                    <Label htmlFor="tempo" className="text-xs md:text-md font-medium">Tempo</Label>
                    <div className="flex-grow flex items-center gap-2 md:gap-4">
                      <Slider
                          id="tempo"
                          min={60}
                          max={240}
                          step={1}
                          value={[tempo]}
                          onValueChange={(value) => onTempoChange(value[0])}
                          className="w-full"
                      />
                      <span className="text-sm md:text-lg font-mono w-14 md:w-16 text-center p-1 md:p-2 rounded-md bg-muted">{tempo}</span>
                    </div>
                </div>
                 <div className="flex-shrink-0">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="icon" className="w-9 h-9 md:w-10 md:h-10">
                                <SlidersHorizontal className="w-4 h-4 md:w-5 md:h-5"/>
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                            </DialogHeader>
                            <MixerControls volumes={volumes} onVolumeChange={onVolumeChange} />
                        </DialogContent>
                    </Dialog>
                </div>
            </CardContent>
        </Card>
    );
}

    
