

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
import { SlidersHorizontal, Drum, Zap, Bot, Wand2, Power, TestTube2 } from 'lucide-react';
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { HelpGuide } from "./help-guide";
import type { AutopilotStyle } from '@/app/page';
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { ScrollArea } from "./ui/scroll-area";
import type { AutopilotPart } from "@/lib/autopilot-worker";
import { Checkbox } from "./ui/checkbox";


type BeatPattern = {
    name: string;
    type: 'Meditative' | 'Classic' | 'System';
};

export type Tempo = {
    name: string;
    bpm: number;
};

type Volumes = { 
    melody: number; 
    manualBass: number;
    latch: number; 
    drums: number; 
    autopilot: number;
    effects: number;
};

type Effects = {
    melody: { reverb: number, delay: number };
    manualBass: { reverb: number, delay: number };
    latch: { reverb: number, delay: number };
    drums: { reverb: number, delay: number };
    autopilot: { reverb: number, delay: number };
    effects: { reverb: number, delay: number };
};

interface BeatBoxControlsProps {
    patterns: BeatPattern[];
    activePattern: BeatPattern;
    onPatternChange: (pattern: BeatPattern) => void;
    tempos: Tempo[];
    activeTempo: Tempo;
    onTempoChange: (tempo: Tempo) => void;
    volumes: Volumes;
    onVolumeChange: (volumes: Volumes) => void;
    effects: Effects;
    onEffectChange: (effects: Effects) => void;
    isAutopilotOn: boolean;
    onAutopilotToggle: (isOn: boolean) => void;
    autopilotStyles: AutopilotStyle[];
    activeAutopilotStyle: AutopilotStyle;
    onAutopilotStyleChange: (style: AutopilotStyle) => void;
    autopilotParts: Record<AutopilotPart, boolean>;
    onAutopilotPartsChange: (parts: Record<AutopilotPart, boolean>) => void;
    isMobile: boolean;
    isLandscape?: boolean;
}

const AutopilotDebugDialog = ({
    autopilotParts,
    onAutopilotPartsChange
}: {
    autopilotParts: Record<AutopilotPart, boolean>;
    onAutopilotPartsChange: (parts: Record<AutopilotPart, boolean>) => void;
}) => {

    const handleCheckedChange = (part: AutopilotPart, checked: boolean) => {
        onAutopilotPartsChange({
            ...autopilotParts,
            [part]: checked
        });
    };
    
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="w-10 h-10 rounded-full">
                    <TestTube2 className="w-5 h-5" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Autopilot Debug</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <p className="text-sm text-muted-foreground">
                        Use these controls to isolate and listen to individual autopilot parts.
                    </p>
                    <div className="space-y-2">
                        {(Object.keys(autopilotParts) as AutopilotPart[]).map(part => (
                             <div key={part} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`check-${part}`}
                                    checked={autopilotParts[part]}
                                    onCheckedChange={(checked) => handleCheckedChange(part, !!checked)}
                                />
                                <label
                                    htmlFor={`check-${part}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize"
                                >
                                    {part}
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
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
    autopilotParts,
    onAutopilotPartsChange,
    isMobile,
    isLandscape = false,
}: BeatBoxControlsProps) {
    const [isBeatsOpen, setIsBeatsOpen] = useState(false);
    const [isTempoOpen, setIsTempoOpen] = useState(false);
    const [isStyleOpen, setIsStyleOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<'Meditative' | 'Classic'>('Meditative');

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

    const isBeatsOn = activePattern && activePattern.name !== 'Off';
    
    const buttonSize = isMobile ? 'sm' : 'default';

    if (isLandscape) {
        return (
            <div className="flex flex-col gap-2">
                <Dialog open={isBeatsOpen} onOpenChange={setIsBeatsOpen}>
                    <DialogTrigger asChild>
                         <Button variant={isBeatsOn ? 'default' : 'outline'} size="icon" className="w-10 h-10 rounded-full">
                            <Drum className="w-5 h-5" />
                        </Button>
                    </DialogTrigger>
                    {/* Beat Patterns Dialog Content */}
                     <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Beat Patterns</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-auto max-h-[70vh]">
                            <div className="space-y-4 py-4 pr-4">
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
                        </ScrollArea>
                    </DialogContent>
                </Dialog>

                <Dialog open={isTempoOpen} onOpenChange={setIsTempoOpen}>
                    <DialogTrigger asChild>
                         <Button variant="outline" size="icon" className="w-10 h-10 rounded-full">
                            <Zap className="w-5 h-5" />
                        </Button>
                    </DialogTrigger>
                     {/* Tempo Dialog Content */}
                     <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Adjust Tempo</DialogTitle>
                        </DialogHeader>
                         <ScrollArea className="h-auto max-h-[70vh]">
                            <div className="grid grid-cols-1 gap-2 py-4 pr-4">
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
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
                
                <Dialog open={isStyleOpen} onOpenChange={setIsStyleOpen}>
                    <DialogTrigger asChild>
                        <Button variant={isAutopilotOn ? 'default' : 'outline'} size="icon" className="w-10 h-10 rounded-full">
                            <Bot className="w-5 h-5" />
                        </Button>
                    </DialogTrigger>
                     {/* Autopilot Dialog Content */}
                     <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Autopilot Style</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-auto max-h-[70vh]">
                            <div className='py-4 space-y-4 pr-4'>
                                <div className="flex items-center space-x-2">
                                    <Switch id="autopilot-switch" checked={isAutopilotOn} onCheckedChange={onAutopilotToggle} />
                                    <Label htmlFor="autopilot-switch">Autopilot On/Off</Label>
                                </div>
                                <div className={cn(
                                    "grid grid-cols-3 gap-2 transition-opacity",
                                    !isAutopilotOn && "opacity-50 pointer-events-none"
                                )}>
                                    {autopilotStyles.map((style) => (
                                        <Button
                                            key={style}
                                            variant={activeAutopilotStyle === style ? 'default' : 'outline'}
                                            onClick={() => {
                                                onAutopilotStyleChange(style);
                                            }}
                                            disabled={!isAutopilotOn}
                                        >
                                            {style}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>


                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="icon" className="w-10 h-10 rounded-full">
                            <SlidersHorizontal className="w-5 h-5"/>
                        </Button>
                    </DialogTrigger>
                    {/* Mixer Dialog Content */}
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Mixer</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-auto max-h-[70vh]">
                            <div className="pr-4">
                                <MixerControls 
                                    volumes={volumes} 
                                    onVolumeChange={onVolumeChange}
                                    effects={effects}
                                    onEffectChange={onEffectChange}
                                />
                            </div>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
                
                <HelpGuide buttonVariant="outline" size="icon" className="w-10 h-10 rounded-full" showText={false}/>
                <AutopilotDebugDialog 
                    autopilotParts={autopilotParts}
                    onAutopilotPartsChange={onAutopilotPartsChange}
                />
            </div>
        )
    }

    return (
        <Card className="bg-card/50">
            <CardContent className="p-2 md:p-4 flex justify-around items-center gap-1 md:gap-2">
                <Dialog open={isBeatsOpen} onOpenChange={setIsBeatsOpen}>
                    <DialogTrigger asChild>
                        <Button variant={isBeatsOn ? 'default' : 'outline'} className="flex-1" size={buttonSize}>
                            <Drum className="w-4 h-4 md:mr-2" />
                            <span className="hidden sm:inline">Beats</span>
                        </Button>
                    </DialogTrigger>
                     <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Beat Patterns</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-auto max-h-[70vh]">
                            <div className="space-y-4 py-4 pr-4">
                                <div className="flex items-center justify-center space-x-2">
                                    <Label htmlFor="category-switch-portrait" className={cn(selectedCategory !== 'Classic' && "text-muted-foreground")}>Classic</Label>
                                    <Switch 
                                        id="category-switch-portrait"
                                        checked={selectedCategory === 'Meditative'}
                                        onCheckedChange={(checked) => setSelectedCategory(checked ? 'Meditative' : 'Classic')}
                                    />
                                    <Label htmlFor="category-switch-portrait" className={cn(selectedCategory !== 'Meditative' && "text-muted-foreground")}>Meditative</Label>
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
                        </ScrollArea>
                    </DialogContent>
                </Dialog>

                <Dialog open={isTempoOpen} onOpenChange={setIsTempoOpen}>
                    <DialogTrigger asChild>
                         <Button variant="outline" className="flex-1" size={buttonSize}>
                            <Zap className="w-4 h-4 md:mr-2" />
                            <span className="hidden sm:inline">Tempo</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Adjust Tempo</DialogTitle>
                        </DialogHeader>
                         <ScrollArea className="h-auto max-h-[70vh]">
                            <div className="grid grid-cols-1 gap-2 py-4 pr-4">
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
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
                
                <Dialog open={isStyleOpen} onOpenChange={setIsStyleOpen}>
                    <DialogTrigger asChild>
                        <Button variant={isAutopilotOn ? 'default' : 'outline'} className="flex-1" size={buttonSize}>
                            <Bot className="w-4 h-4 md:mr-2" />
                            <span className="hidden sm:inline">Autopilot</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Autopilot Style</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-auto max-h-[70vh]">
                            <div className='py-4 space-y-4 pr-4'>
                                <div className="flex items-center space-x-2">
                                    <Switch id="autopilot-switch-portrait" checked={isAutopilotOn} onCheckedChange={onAutopilotToggle} />
                                    <Label htmlFor="autopilot-switch-portrait">Autopilot On/Off</Label>
                                </div>
                                <div className={cn(
                                    "grid grid-cols-3 gap-2 transition-opacity",
                                    !isAutopilotOn && "opacity-50 pointer-events-none"
                                )}>
                                    {autopilotStyles.map((style) => (
                                        <Button
                                            key={style}
                                            variant={activeAutopilotStyle === style ? 'default' : 'outline'}
                                            onClick={() => {
                                                onAutopilotStyleChange(style);
                                            }}
                                            disabled={!isAutopilotOn}
                                        >
                                            {style}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>


                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="flex-1 px-2 md:px-4" size={buttonSize}>
                            <SlidersHorizontal className="w-4 h-4 md:mr-2"/>
                             <span className="hidden sm:inline">Mixer</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Mixer</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-auto max-h-[70vh]">
                             <div className="pr-4">
                                <MixerControls 
                                    volumes={volumes} 
                                    onVolumeChange={onVolumeChange}
                                    effects={effects}
                                    onEffectChange={onEffectChange}
                                />
                            </div>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>

                <HelpGuide buttonVariant="outline" buttonClassName="flex-1" size={buttonSize}/>

                <AutopilotDebugDialog 
                    autopilotParts={autopilotParts}
                    onAutopilotPartsChange={onAutopilotPartsChange}
                />

            </CardContent>
        </Card>
    );
}
