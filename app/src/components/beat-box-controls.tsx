
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { SlidersHorizontal, Drum } from 'lucide-react';
import { useState, useMemo, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import { HelpGuide } from "./help-guide";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import type { BeatPattern, Volumes, CompressorSettings } from '@/types';
import { MixerControls } from "./mixer-controls";
import { beatPatterns } from "@/lib/drum-machine";

interface BeatBoxControlsProps {
    activePattern: BeatPattern;
    onPatternChange: (pattern: BeatPattern) => void;
    volumes: Volumes;
    onMixerChange: (volumes: Partial<Volumes>) => void;
    onCompressorChange: (compressorSettings: CompressorSettings) => void;
    tempo: number;
    setTempo: (tempo: number) => void;
    swing: number;
    setSwing: (swing: number) => void;
    isMobile: boolean;
    isLandscape?: boolean;
}

const ControlButtonWithTooltip = memo(function ControlButtonWithTooltip({ tooltipText, children, ...props}: React.ComponentProps<typeof Button> & { tooltipText: string, children: React.ReactNode}) {
    const { ...buttonProps } = props;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button {...buttonProps}>{children}</Button>
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltipText}</p>
            </TooltipContent>
        </Tooltip>
    );
});
ControlButtonWithTooltip.displayName = 'ControlButtonWithTooltip';


export function BeatBoxControls({
    activePattern,
    onPatternChange,
    volumes,
    onMixerChange,
    onCompressorChange,
    tempo,
    setTempo,
    swing,
    setSwing,
    isMobile,
    isLandscape = false,
}: BeatBoxControlsProps) {
    const [isBeatsOpen, setIsBeatsOpen] = useState(false);
    const [isMixerOpen, setIsMixerOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<'Meditative' | 'Classic'>('Meditative');
    
    const { classicPatterns, meditativePatterns, offPattern } = useMemo(() => {
        const classic = beatPatterns.filter(p => p.type === 'Classic');
        const meditative = beatPatterns.filter(p => p.type === 'Meditative');
        const system = beatPatterns.find(p => p.type === 'System');
        return {
            classicPatterns: classic,
            meditativePatterns: meditative,
            offPattern: system,
        }
    }, []);
    
    const patternsToShow = selectedCategory === 'Classic' ? classicPatterns : meditativePatterns;

    const isBeatsOn = activePattern && activePattern.name !== 'Off';
    
    const buttonSize = isMobile ? 'sm' : 'default';

    const ControlButtonWrapper = useCallback(({ tooltipText, ...props }: React.ComponentProps<typeof Button> & { tooltipText: string }) => {
        const { ...buttonProps } = props;
        if (isMobile) return <Button {...buttonProps} />;
        return (
             <ControlButtonWithTooltip tooltipText={tooltipText} {...buttonProps} />
        );
    }, [isMobile]);

    if (isLandscape) {
        return (
            <TooltipProvider>
                <div className="flex flex-col gap-2">
                    <Dialog open={isBeatsOpen} onOpenChange={setIsBeatsOpen}>
                        <DialogTrigger asChild>
                             <ControlButtonWithTooltip tooltipText="Beats" variant={isBeatsOn ? 'default' : 'outline'} size="icon" className="w-10 h-10 rounded-full">
                                <Drum className="w-5 h-5" />
                            </ControlButtonWithTooltip>
                        </DialogTrigger>
                         <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Beat Patterns</DialogTitle>
                                <DialogDescription>Select a rhythm style.</DialogDescription>
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
                                                variant={activePattern.name === 'Off' ? 'default' : 'outline'}
                                                onClick={() => {
                                                    onPatternChange(offPattern);
                                                    setIsBeatsOpen(false);
                                                }}
                                                className="w-full"
                                            >
                                                {offPattern.name}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isMixerOpen} onOpenChange={setIsMixerOpen}>
                        <DialogTrigger asChild>
                            <ControlButtonWithTooltip tooltipText="Mixer" variant="outline" size="icon" className="w-10 h-10 rounded-full">
                                <SlidersHorizontal className="w-5 h-5"/>
                            </ControlButtonWithTooltip>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                                <DialogDescription>Adjust volume, effects, tempo, and swing.</DialogDescription>
                            </DialogHeader>
                            <ScrollArea className="h-auto max-h-[70vh]">
                                <div className="pr-4 py-4">
                                    <MixerControls 
                                        volumes={volumes} 
                                        onMixerChange={onMixerChange}
                                        onCompressorChange={onCompressorChange}
                                        tempo={tempo}
                                        setTempo={setTempo}
                                        swing={swing}
                                        setSwing={setSwing}
                                        closeDialog={() => setIsMixerOpen(false)}
                                    />
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                    
                    <HelpGuide buttonVariant="outline" size="icon" className="w-10 h-10 rounded-full" showText={false}/>
                </div>
            </TooltipProvider>
        )
    }

    return (
        <TooltipProvider>
            <Card className="bg-card/50">
                <CardContent className="p-2 md:p-4 flex justify-around items-center gap-1 md:gap-2">
                    <Dialog open={isBeatsOpen} onOpenChange={setIsBeatsOpen}>
                        <DialogTrigger asChild>
                            <ControlButtonWrapper tooltipText="Beats" variant={isBeatsOn ? 'default' : 'outline'} className="flex-1" size={buttonSize}>
                                <Drum className="w-4 h-4 md:mr-2" />
                                <span className="hidden sm:inline">Beats</span>
                            </ControlButtonWrapper>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Beat Patterns</DialogTitle>
                                <DialogDescription>Select a rhythm style.</DialogDescription>
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
                                                variant={activePattern.name === 'Off' ? 'default' : 'outline'}
                                                onClick={() => {
                                                    onPatternChange(offPattern);
                                                    setIsBeatsOpen(false);
                                                }}
                                                className="w-full"
                                            >
                                                {offPattern.name}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isMixerOpen} onOpenChange={setIsMixerOpen}>
                         <DialogTrigger asChild>
                            <ControlButtonWrapper tooltipText="Mixer" variant="outline" className="flex-1 px-2 md:px-4" size={buttonSize}>
                                <SlidersHorizontal className="w-4 h-4 md:mr-2"/>
                                <span className="hidden sm:inline">Mixer</span>
                            </ControlButtonWrapper>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                                <DialogDescription>Adjust volume, effects, tempo, and swing.</DialogDescription>
                            </DialogHeader>
                            <ScrollArea className="h-auto max-h-[70vh]">
                                <div className="pr-4 py-4">
                                    <MixerControls 
                                        volumes={volumes}
                                        onMixerChange={onMixerChange}
                                        onCompressorChange={onCompressorChange}
                                        tempo={tempo}
                                        setTempo={setTempo}
                                        swing={swing}
                                        setSwing={setSwing}
                                        closeDialog={() => setIsMixerOpen(false)}
                                    />
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                    
                    <HelpGuide buttonVariant="outline" buttonClassName="flex-1" size={buttonSize}/>
                </CardContent>
            </Card>
        </TooltipProvider>
    );
}
