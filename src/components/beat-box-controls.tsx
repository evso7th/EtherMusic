
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { MixerControls } from '@/components/mixer-controls';
import { SlidersHorizontal, Drum, Zap, Bot, Wand2, Power } from 'lucide-react';
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { HelpGuide } from "./help-guide";
import type { AutopilotStyle } from '@/app/page';
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";


type BeatPattern = {
    name: string;
    patterns: any;
    type: 'Meditative' | 'Classic' | 'System';
};

export type Tempo = {
    name: string;
    bpm: number;
};

interface BeatBoxControlsProps {
    patterns: BeatPattern[];
    activePattern: BeatPattern;
    onPatternChange: (pattern: BeatPattern) => void;
    tempos: Tempo[];
    activeTempo: Tempo;
    onTempoChange: (tempo: Tempo) => void;
    volumes: { melody: number; bass: number; drums: number; autopilot: number };
    onVolumeChange: (volumes: BeatBoxControlsProps['volumes']) => void;
    effects: {
        melody: { reverb: number, delay: number };
        bass: { reverb: number, delay: number };
        drums: { reverb: number, delay: number };
        autopilot: { reverb: number, delay: number };
    };
    onEffectChange: (effects: BeatBoxControlsProps['effects']) => void;
    isAutopilotOn: boolean;
    onAutopilotToggle: () => void;
    autopilotStyles: AutopilotStyle[];
    activeAutopilotStyle: AutopilotStyle;
    onAutopilotStyleChange: (style: AutopilotStyle) => void;
    isMobile: boolean;
}

export function BeatBoxControls({
    patterns,
    activePattern,
    onPatternChange,
    tempos,
    activeTempo,
    onTempoChange,
    volumes,
    onVolumeChange,
    effects,
    onEffectChange,
    isAutopilotOn,
    onAutopilotToggle,
    autopilotStyles,
    activeAutopilotStyle,
    onAutopilotStyleChange,
    isMobile,
}: BeatBoxControlsProps) {
    const [isBeatsOpen, setIsBeatsOpen] = useState(false);
    const [isTempoOpen, setIsTempoOpen] = useState(false);
    const [isStyleOpen, setIsStyleOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<'Meditative' | 'Classic'>('Classic');

    const handleExit = () => {
        if (typeof window !== "undefined") {
            window.close();
        }
    };
    
    const { classicPatterns, meditativePatterns, offPattern } = useMemo(() => {
        return {
            classicPatterns: patterns.filter(p => p.type === 'Classic'),
            meditativePatterns: patterns.filter(p => p.type === 'Meditative'),
            offPattern: patterns.find(p => p.type === 'System'),
        }
    }, [patterns]);
    
    const patternsToShow = selectedCategory === 'Classic' ? classicPatterns : meditativePatterns;

    return (
        <Card className="bg-card/50">
            <CardContent className="p-2 md:p-4 flex justify-around items-center gap-1 md:gap-2">
                <Dialog open={isBeatsOpen} onOpenChange={setIsBeatsOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="flex-1" size={isMobile ? 'sm' : 'default'}>
                            <Drum className="w-4 h-4 md:mr-2" />
                            <span className="hidden sm:inline">Beats</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Beat Patterns</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="flex items-center justify-center space-x-2">
                                <Label htmlFor="category-switch" className={cn(selectedCategory !== 'Classic' && "text-muted-foreground")}>Classic</Label>
                                <Switch 
                                    id="category-switch"
                                    checked={selectedCategory === 'Meditative'}
                                    onCheckedChange={(checked) => setSelectedCategory(checked ? 'Meditative' : 'Classic')}
                                />
                                <Label htmlFor="category-switch" className={cn(selectedCategory !== 'Meditative' && "text-muted-foreground")}>Meditative</Label>
                            </div>
                           
                            <div className="grid grid-cols-2 gap-2">
                                {patternsToShow.map((pattern) => (
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
                            
                            {offPattern && (
                                <div>
                                    <Separator className="my-3" />
                                    <Button
                                        key={offPattern.name}
                                        variant={'outline'}
                                        onClick={() => {
                                            onPatternChange(offPattern);
                                            setIsBeatsOpen(false);
                                        }}
                                        className={cn(
                                            "w-full",
                                            activePattern.name === offPattern.name && "border-primary text-primary"
                                        )}
                                    >
                                        {offPattern.name}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>

                <Dialog open={isTempoOpen} onOpenChange={setIsTempoOpen}>
                    <DialogTrigger asChild>
                         <Button variant="outline" className="flex-1" size={isMobile ? 'sm' : 'default'}>
                            <Zap className="w-4 h-4 md:mr-2" />
                            <span className="hidden sm:inline">Tempo</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Adjust Tempo</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-1 gap-2 py-4">
                            {tempos.map((tempo) => (
                                <Button
                                    key={tempo.name}
                                    variant={activeTempo.name === tempo.name ? 'default' : 'outline'}
                                    onClick={() => {
                                        onTempoChange(tempo);
                                        setIsTempoOpen(false);
                                    }}
                                    className="flex justify-between w-full"
                                >
                                    <span>{tempo.name}</span>
                                    <span className="text-sm text-muted-foreground">{tempo.bpm} BPM</span>
                                </Button>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>
                
                <Button
                    variant={isAutopilotOn ? 'default' : 'outline'}
                    onClick={onAutopilotToggle}
                    className="flex-1"
                    size={isMobile ? 'sm' : 'default'}
                >
                    <Bot className="w-4 h-4 md:mr-2" />
                    <span className="hidden sm:inline">Autopilot</span>
                </Button>

                {isAutopilotOn && (
                     <Dialog open={isStyleOpen} onOpenChange={setIsStyleOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="flex-1" size={isMobile ? 'sm' : 'default'}>
                                <Wand2 className="w-4 h-4 md:mr-2" />
                                <span className="hidden sm:inline">Style</span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Autopilot Style</DialogTitle>
                            </DialogHeader>
                            <div className="grid grid-cols-3 gap-2 py-4">
                                {autopilotStyles.map((style) => (
                                    <Button
                                        key={style}
                                        variant={activeAutopilotStyle === style ? 'default' : 'outline'}
                                        onClick={() => {
                                            onAutopilotStyleChange(style);
                                            setIsStyleOpen(false);
                                        }}
                                    >
                                        {style}
                                    </Button>
                                ))}
                            </div>
                        </DialogContent>
                    </Dialog>
                )}


                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="flex-1 px-2 md:px-4" size={isMobile ? 'sm' : 'default'}>
                            <SlidersHorizontal className="w-4 h-4 md:mr-2"/>
                             <span className="hidden sm:inline">Mixer</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Mixer</DialogTitle>
                        </DialogHeader>
                        <MixerControls 
                            volumes={volumes} 
                            onVolumeChange={onVolumeChange}
                            effects={effects}
                            onEffectChange={onEffectChange}
                         />
                    </DialogContent>
                </Dialog>

                <HelpGuide buttonVariant="outline" buttonClassName="flex-1" size={isMobile ? 'sm' : 'default'}/>

                {isMobile && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="flex-1" aria-label="Exit App">
                                <Power className="w-4 h-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>End Meditation?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to break your meditation and leave the app?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>No</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={handleExit}
                                    className="bg-transparent border border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                                >
                                    Yes
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </CardContent>
        </Card>
    );
}
