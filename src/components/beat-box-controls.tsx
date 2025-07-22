"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type BeatPattern = {
    name: string;
    sequence: string[];
};

interface BeatBoxControlsProps {
    patterns: BeatPattern[];
    activePattern: BeatPattern;
    onPatternChange: (pattern: BeatPattern) => void;
    tempo: number;
    onTempoChange: (tempo: number) => void;
}

export function BeatBoxControls({
    patterns,
    activePattern,
    onPatternChange,
    tempo,
    onTempoChange,
}: BeatBoxControlsProps) {
    return (
        <Card className="bg-card/50 h-full">
            <CardContent className="p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 h-full">
                <div className="flex-shrink-0">
                    <Label className="text-lg font-bold mb-2 block">Beat Box</Label>
                    <div className="flex flex-wrap gap-2">
                        {patterns.map((pattern) => (
                            <Button
                                key={pattern.name}
                                variant={activePattern.name === pattern.name ? 'default' : 'outline'}
                                onClick={() => onPatternChange(pattern)}
                                size="sm"
                            >
                                {pattern.name}
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="w-full md:w-auto flex-grow flex items-center gap-4">
                    <Label htmlFor="tempo" className="text-md font-medium">Tempo</Label>
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
                      <span className="text-lg font-mono w-16 text-center p-2 rounded-md bg-muted">{tempo} BPM</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
