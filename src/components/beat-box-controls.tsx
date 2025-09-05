
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { MixerControls, AutopilotMixerControls } from '@/components/mixer-controls';
import { SlidersHorizontal, Drum, Zap, Bot, Power, Wand2, Music, Save, FolderDown } from 'lucide-react';
import { useState, useMemo, memo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { HelpGuide } from "./help-guide";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useAutopilot } from "@/hooks/use-autopilot";
import type { BeatPattern, Tempo, AutopilotStyle, Volumes, Instrument, AutopilotPart } from '@/types';


export const autopilotStyles: AutopilotStyle[] = [
    { name: 'Evolve', description: 'Continuously evolving ambient soundscape.' },
]

interface BeatBoxControlsProps {
    patterns: BeatPattern[];
    activePattern: BeatPattern;
    onPatternChange: (pattern: BeatPattern) => void;
    tempos: Tempo[];
    activeTempo: Tempo;
    onTempoChange: (tempo: Tempo) => void;
    initialVolumes: Volumes;
    onVolumeChange: (volumes: Volumes) => void;
    isAutopilotOn: boolean;
    onAutopilotToggle: (isOn: boolean) => void;
    autopilotInstruments: Instrument[];
    activeAutopilotInstruments: Record<AutopilotPart, Instrument>;
    onAutopilotInstrumentChange: (part: AutopilotPart, instrument: Instrument) => void;
    isMobile: boolean;
    isLandscape?: boolean;
}

const MemoizedAutopilotInstrumentSelector = memo(function AutopilotInstrumentSelector({
    label,
    value,
    onChange,
    instruments
}: {
    label: string,
    value: Instrument,
    onChange: (instrument: Instrument) => void,
    instruments: Instrument[]
}) {
    return (
        <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`inst-${label}`} className="text-right">{label}</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger id={`inst-${label}`} className="col-span-3 capitalize">
                    <SelectValue placeholder="Select instrument" />
                </SelectTrigger>
                <SelectContent>
                    {instruments.map(inst => (
                        <SelectItem key={inst} value={inst} className="capitalize">{inst.replace(/_/g, ' ')}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
});

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
    tempos,
    activeTempo,
    onTempoChange,
    initialVolumes,
    onVolumeChange,
    isAutopilotOn,
    onAutopilotToggle,
    autopilotInstruments,
    activeAutopilotInstruments,
    onAutopilotInstrumentChange,
    isMobile,
    isLandscape = false,
}: BeatBoxControlsProps) {
    const [isBeatsOpen, setIsBeatsOpen] = useState(false);
    const [isTempoOpen, setIsTempoOpen] = useState(false);
    const [isAutopilotOpen, setIsAutopilotOpen] = useState(false);
    const [isAutopilotMixerOpen, setIsAutopilotMixerOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<'Meditative' | 'Classic'>('Meditative');
    
    // Local state for autopilot instrument settings to apply them on dialog close
    const [tempAutopilotInstruments, setTempAutopilotInstruments] = useState(activeAutopilotInstruments);

    useEffect(() => {
        if (isAutopilotOpen) {
            setTempAutopilotInstruments(activeAutopilotInstruments);
        }
    }, [isAutopilotOpen, activeAutopilotInstruments]);

    const handleTempInstrumentChange = (part: AutopilotPart, instrument: Instrument) => {
        setTempAutopilotInstruments(prev => ({ ...prev, [part]: instrument }));
    };

    const applyInstrumentChanges = () => {
        (Object.keys(tempAutopilotInstruments) as AutopilotPart[]).forEach(part => {
            if (tempAutopilotInstruments[part] !== activeAutopilotInstruments[part]) {
                onAutopilotInstrumentChange(part, tempAutopilotInstruments[part]);
            }
        });
    };
    
    const handleAutopilotDialogChange = (open: boolean) => {
        if (!open) {
            applyInstrumentChanges();
        }
        setIsAutopilotOpen(open);
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

    const ControlButtonWrapper = useCallback(({ tooltipText, children }: { tooltipText: string, children: React.ReactNode }) => {
        if (isMobile) return <>{children}</>;
        return (
             <Tooltip>
                <TooltipTrigger asChild>
                    {children}
                </TooltipTrigger>
                <TooltipContent>
                    <p>{tooltipText}</p>
                </TooltipContent>
            </Tooltip>
        );
    }, [isMobile]);

    const autopilotDialog = (
        <Dialog open={isAutopilotOpen} onOpenChange={handleAutopilotDialogChange}>
            <DialogTrigger asChild>
                 <ControlButtonWrapper tooltipText="Autopilot">
                    <Button
                        variant={isAutopilotOn ? 'default' : 'outline'} size={isLandscape ? "icon" : buttonSize} className={cn(isLandscape && "w-10 h-10 rounded-full", !isLandscape && "flex-1")}>
                        <Bot className={cn("w-5 h-5", !isLandscape && "md:mr-2")} />
                        {!isLandscape && <span className="hidden sm:inline">Autopilot</span>}
                    </Button>
                </ControlButtonWrapper>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Autopilot Controls</DialogTitle>
                </DialogHeader>
                 <ScrollArea className="h-auto max-h-[70vh]">
                    <div className='py-4 pr-4 space-y-4'>
                        <div className="flex items-center space-x-2">
                            <Switch id="autopilot-switch" checked={isAutopilotOn} onCheckedChange={onAutopilotToggle} />
                            <Label htmlFor="autopilot-switch">Autopilot On/Off</Label>
                        </div>

                         <div className="space-y-2">
                            <Label>Style</Label>
                             <Select defaultValue="Evolve">
                                <SelectTrigger>
                                    <SelectValue placeholder="Select style" />
                                </SelectTrigger>
                                <SelectContent>
                                    {autopilotStyles.map(style => (
                                        <SelectItem key={style.name} value={style.name}>
                                            <div className="flex flex-col">
                                                <span>{style.name}</span>
                                                <span className="text-xs text-muted-foreground">{style.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>


                        <Separator />

                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-center text-muted-foreground">Instruments</h4>
                            <MemoizedAutopilotInstrumentSelector 
                                label="Melody"
                                value={tempAutopilotInstruments.melody}
                                onChange={(inst) => handleTempInstrumentChange('melody', inst as Instrument)}
                                instruments={autopilotInstruments.filter(i => !i.includes('bass') && !i.includes('effect'))}
                            />
                            <MemoizedAutopilotInstrumentSelector 
                                label="Accompaniment"
                                value={tempAutopilotInstruments.accompaniment}
                                onChange={(inst) => handleTempInstrumentChange('accompaniment', inst as Instrument)}
                                instruments={autopilotInstruments.filter(i => !i.includes('bass') && !i.includes('effect'))}
                            />
                            <MemoizedAutopilotInstrumentSelector 
                                label="Bass"
                                value={tempAutopilotInstruments.bass}
                                onChange={(inst) => handleTempInstrumentChange('bass', inst as Instrument)}
                                instruments={autopilotInstruments.filter(i => (i.includes('bass') || i === 'synth' || i === 'organ' || i === 'mellotron') && !i.includes('effect'))}
                            />
                            <MemoizedAutopilotInstrumentSelector 
                                label="Effects"
                                value={tempAutopilotInstruments.effects}
                                onChange={(inst) => handleTempInstrumentChange('effects', inst as Instrument)}
                                instruments={autopilotInstruments.filter(i => i.includes('effect') || i === 'G-Drops')}
                            />
                        </div>

                        <Separator />

                        <Dialog open={isAutopilotMixerOpen} onOpenChange={setIsAutopilotMixerOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full">
                                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                                    Autopilot Mixer
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Autopilot Mixer</DialogTitle>
                                </DialogHeader>
                                <ScrollArea className="h-auto max-h-[70vh]">
                                    <div className="pr-4 py-4">
                                        <AutopilotMixerControls
                                            initialVolumes={initialVolumes} 
                                            onVolumeChange={onVolumeChange}
                                            isMobile={isMobile}
                                        />
                                    </div>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );

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

                    <Dialog open={isTempoOpen} onOpenChange={setIsTempoOpen}>
                        <DialogTrigger asChild>
                             <ControlButtonWithTooltip tooltipText="Tempo" variant="outline" size="icon" className="w-10 h-10 rounded-full">
                                <Zap className="w-5 h-5" />
                            </ControlButtonWithTooltip>
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
                    
                    {autopilotDialog}

                    <Dialog>
                        <DialogTrigger asChild>
                             <ControlButtonWithTooltip tooltipText="Mixer" variant="outline" size="icon" className="w-10 h-10 rounded-full">
                                <SlidersHorizontal className="w-5 h-5"/>
                            </ControlButtonWithTooltip>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="h-auto max-h-[70vh]">
                                <div className="pr-4 py-4">
                                    <MixerControls 
                                        initialVolumes={initialVolumes} 
                                        onVolumeChange={onVolumeChange}
                                        isMobile={isMobile}
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
                            <ControlButtonWrapper tooltipText="Beats">
                                <Button variant={isBeatsOn ? 'default' : 'outline'} className="flex-1" size={buttonSize}>
                                    <Drum className="w-4 h-4 md:mr-2" />
                                    <span className="hidden sm:inline">Beats</span>
                                </Button>
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

                    <Dialog open={isTempoOpen} onOpenChange={setIsTempoOpen}>
                        <DialogTrigger asChild>
                            <ControlButtonWrapper tooltipText="Tempo">
                                <Button variant="outline" className="flex-1" size={buttonSize}>
                                    <Zap className="w-4 h-4 md:mr-2" />
                                    <span className="hidden sm:inline">Tempo</span>
                                </Button>
                            </ControlButtonWrapper>
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
                    
                    {autopilotDialog}

                    <Dialog>
                        <DialogTrigger asChild>
                            <ControlButtonWrapper tooltipText="Mixer">
                                <Button variant="outline" className="flex-1 px-2 md:px-4" size={buttonSize}>
                                    <SlidersHorizontal className="w-4 h-4 md:mr-2"/>
                                    <span className="hidden sm:inline">Mixer</span>
                                </Button>
                            </ControlButtonWrapper>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="h-auto max-h-[70vh]">
                                <div className="pr-4 py-4">
                                    <MixerControls 
                                        initialVolumes={initialVolumes} 
                                        onVolumeChange={onVolumeChange}
                                        isMobile={isMobile}
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

    