
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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


interface BeatBoxControlsProps {
    patterns: BeatPattern[];
    activePattern: BeatPattern;
    onPatternChange: (pattern: BeatPattern) => void;
    volumes: Volumes;
    handleMixerChange: (volumes: Partial<Volumes>) => void;
    onCompressorChange: (compressorSettings: CompressorSettings) => void;
    isMobile: boolean;
    isLandscape?: boolean;
}

const ControlButtonWithTooltip = memo(function ControlButtonWithTooltip({ tooltipText, children, ...props}: React.ComponentProps<typeof Button> & { tooltipText: string, children: React.ReactNode}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button {...props}>{children}</Button>
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltipText}</p>
            </TooltipContent>
        </Tooltip>
    );
});


export function BeatBoxControls({
    patterns,
    activePattern,
    onPatternChange,
    volumes,
    handleMixerChange,
    onCompressorChange,
    isMobile,
    isLandscape = false,
}: BeatBoxControlsProps) {
    const [isBeatsOpen, setIsBeatsOpen] = useState(false);
    const [isMixerOpen, setIsMixerOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<'Meditative' | 'Classic'>('Meditative');
    
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

    const ControlButtonWrapper = useCallback(({ tooltipText, children, ...props }: React.ComponentProps<typeof Button> & { tooltipText: string, children: React.ReactNode }) => {
        if (isMobile) return <Button {...props}>{children}</Button>;
        return (
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button {...props}>{children}</Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{tooltipText}</p>
                </TooltipContent>
            </Tooltip>
        );
    }, [isMobile]);
    
    const handleMixerOpenChange = (open: boolean) => {
        console.log(`[TRACING] Mixer dialog state changed. Is open: ${open}`);
        setIsMixerOpen(open);
    };

    const handleMixerTriggerClick = () => {
        console.log('[TRACING] Mixer button clicked');
        setIsMixerOpen(true);
    };

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

                    <Dialog open={isMixerOpen} onOpenChange={handleMixerOpenChange}>
                        <DialogTrigger asChild>
                            <div onClick={handleMixerTriggerClick}>
                                <ControlButtonWithTooltip tooltipText="Mixer" variant="outline" size="icon" className="w-10 h-10 rounded-full">
                                    <SlidersHorizontal className="w-5 h-5"/>
                                </ControlButtonWithTooltip>
                            </div>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="h-auto max-h-[70vh]">
                                <div className="pr-4 py-4">
                                    <MixerControls 
                                        volumes={volumes} 
                                        onMixerChange={handleMixerChange}
                                        onCompressorChange={onCompressorChange}
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

                    <Dialog open={isMixerOpen} onOpenChange={handleMixerOpenChange}>
                         <DialogTrigger asChild>
                            <div onClick={handleMixerTriggerClick}>
                                <ControlButtonWrapper tooltipText="Mixer" variant="outline" className="flex-1 px-2 md:px-4" size={buttonSize}>
                                    <SlidersHorizontal className="w-4 h-4 md:mr-2"/>
                                    <span className="hidden sm:inline">Mixer</span>
                                </ControlButtonWrapper>
                            </div>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="h-auto max-h-[70vh]">
                                <div className="pr-4 py-4">
                                    <MixerControls 
                                        volumes={volumes}
                                        onMixerChange={handleMixerChange}
                                        onCompressorChange={onCompressorChange}
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

    