
"use client";

import type { PointerEvent } from 'react';
import { useRef, useCallback, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Anchor, SlidersHorizontal, Blend, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MusicKey, MusicScale, Instrument, BassInstrument, InstrumentPreset, BassInstrumentPreset, ChannelVolumes } from '@/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type { OrbManager } from '@/lib/orb-manager';
import { Slider } from './ui/slider';

interface ThereminPadProps {
    type: 'melody' | 'bass';
    onInteraction: (type: 'melody' | 'bass', params: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => void;
    allowedFrequencies: number[];
    color: string;
    isPolyphonic?: boolean;
    isDisabled?: boolean;
    instruments?: readonly InstrumentPreset[] | readonly BassInstrumentPreset[];
    activeInstrument?: Instrument | BassInstrument;
    onInstrumentChange?: (instrument: any) => void;
    musicKeys?: MusicKey[];
    activeKey?: MusicKey;
    onKeyChange?: (key: MusicKey) => void;
    musicScales?: MusicScale[];
    activeScale?: MusicScale;
    onScaleChange?: (scale: MusicScale) => void;
    isLatchOn?: boolean;
    onLatchToggle?: (checked: boolean) => void;
    orbManager?: OrbManager | null;
    channelVolumes: ChannelVolumes;
    onChannelVolumeChange: (newVolumes: Partial<ChannelVolumes>) => void;
}

const padTitles = {
    melody: "Melody Pad",
    bass: "Bass Pad"
}

const EffectControl = ({
    label,
    icon: Icon,
    level,
    onLevelChange,
    onLevelCommit,
    min,
    max,
    step,
    unit
}: {
    label: string,
    icon: React.ElementType,
    level: number,
    onLevelChange: (v: number) => void,
    onLevelCommit: (v: number) => void,
    min: number,
    max: number,
    step: number,
    unit: string
}) => (
     <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-accent flex-shrink-0" />
            <Label className="text-sm font-medium flex-1 truncate">{label}</Label>
            <span className="text-xs text-muted-foreground w-12 text-right">{level.toFixed(0)}{unit}</span>
        </div>
        <div className="flex items-center gap-4 pl-7">
            <Slider
                min={min}
                max={max}
                step={step}
                value={[level]}
                onValueChange={(v) => onLevelChange(v[0])}
                onValueCommit={(v) => onLevelCommit(v[0])}
            />
        </div>
    </div>
);


export function ThereminPad({ 
    type, 
    onInteraction, 
    allowedFrequencies, 
    color,
    isPolyphonic = false,
    isDisabled = false,
    instruments, 
    activeInstrument, 
    onInstrumentChange,
    musicKeys,
    activeKey,
    onKeyChange,
    musicScales,
    activeScale,
    onScaleChange,
    isLatchOn,
    onLatchToggle,
    orbManager,
    channelVolumes,
    onChannelVolumeChange
}: ThereminPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const isMobile = useIsMobile();
    
    const [localVolumes, setLocalVolumes] = useState(channelVolumes);

    useEffect(() => {
        setLocalVolumes(channelVolumes);
    }, [channelVolumes]);

    const handleReverbCommit = (value: number) => {
        onChannelVolumeChange({ reverbSend: value });
    };

    const handleDistortionCommit = (value: number) => {
        onChannelVolumeChange({ distortion: value });
    };

    // Manage orbs for latch mode
    useEffect(() => {
        if (type === 'bass' && orbManager) {
            if (!isLatchOn) {
                orbManager.removeAllOrbs('latch');
            }
        }
    }, [isLatchOn, orbManager, type]);

    const calculateInteraction = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!padRef.current || !allowedFrequencies || allowedFrequencies.length === 0) return null;
        const rect = padRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const normalizedX = Math.min(Math.max(x / rect.width, 0), 1);
        const normalizedY = Math.min(Math.max(y / rect.height, 0), 1);

        const index = Math.floor(normalizedX * allowedFrequencies.length);
        const frequency = allowedFrequencies[Math.min(index, allowedFrequencies.length - 1)];
        
        // Volume is inverted: top is loud (0), bottom is quiet (1)
        const volume = Math.pow(1 - normalizedY, 2); // Make it more sensitive at the top
        
        return { x, y, frequency, volume, pointerId: event.pointerId };
    }, [allowedFrequencies]);
    

    const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (isDisabled) return;
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            onInteraction(type, interactionData, 'down');
        }
    }, [calculateInteraction, isDisabled, onInteraction, type]);

    const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (isDisabled || !(event.buttons > 0)) return;
        
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            onInteraction(type, interactionData, 'move');
        }
    }, [calculateInteraction, isDisabled, onInteraction, type]);

    const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (isDisabled) return;
        
        if (isLatchOn && type === 'bass') {
             // In latch mode, up event doesn't stop the note, it's handled by toggle
        } else {
             const interactionData = calculateInteraction(event);
             onInteraction(type, interactionData, 'up');
        }
        
        if ((event.target as HTMLElement).hasPointerCapture(event.pointerId)) {
            (event.target as HTMLElement).releasePointerCapture(event.pointerId);
        }
    }, [calculateInteraction, isDisabled, onInteraction, type, isLatchOn]);
    
     const renderSettingsControls = () => {
        const triggerButton = (
             <Button variant="outline" size="sm" className={cn("h-8 capitalize",
                    type === 'melody' ? "border-primary text-primary hover:bg-primary hover:text-primary-foreground" : "border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                )}>
                <SlidersHorizontal className="w-4 h-4 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Settings</span>
            </Button>
        );

        const sheetTrigger = isMobile ? (
            <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        ) : (
            <Tooltip>
                <TooltipTrigger asChild>
                    <SheetTrigger asChild>{triggerButton}</SheetTrigger>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{type === 'melody' ? 'Melody Settings' : 'Bass Settings'}</p>
                </TooltipContent>
            </Tooltip>
        );
        
        return (
            <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                {sheetTrigger}
                <SheetContent side={isMobile ? "bottom" : "right"}>
                    <SheetHeader>
                        <SheetTitle>{padTitles[type]} Settings</SheetTitle>
                    </SheetHeader>
                     <ScrollArea className="h-[85vh]">
                        <div className="py-4 pr-4 space-y-6">
                            {instruments && activeInstrument && onInstrumentChange && (
                                <div className="space-y-2">
                                    <Label>Instrument</Label>
                                    <Select value={activeInstrument} onValueChange={onInstrumentChange}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Instrument" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {instruments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {(musicKeys || musicScales) && <Separator />}

                            {type === 'melody' && (
                                <>
                                    {musicKeys && activeKey && onKeyChange && (
                                        <div className="space-y-2">
                                            <Label>Music Key</Label>
                                            <Select value={activeKey} onValueChange={onKeyChange as (value: string) => void}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Key" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {musicKeys.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {musicScales && activeScale && onScaleChange && (
                                        <div className="space-y-2">
                                            <Label>Music Scale</Label>
                                            <Select value={activeScale} onValueChange={onScaleChange as (value: string) => void}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Scale" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {musicScales.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                 </>
                            )}
                            
                            <Separator />
                            <div className="space-y-4">
                                <EffectControl
                                    label="Reverb"
                                    icon={Blend}
                                    level={localVolumes.reverbSend}
                                    onLevelChange={(v) => setLocalVolumes(prev => ({...prev, reverbSend: v}))}
                                    onLevelCommit={handleReverbCommit}
                                    min={-48} max={6} step={1} unit="dB"
                                />
                                <EffectControl
                                    label="Distortion"
                                    icon={Waves}
                                    level={localVolumes.distortion}
                                    onLevelChange={(v) => setLocalVolumes(prev => ({...prev, distortion: v}))}
                                    onLevelCommit={handleDistortionCommit}
                                    min={0} max={100} step={1} unit="%"
                                />
                            </div>

                            <Separator />

                            <Button 
                                onClick={() => setIsSettingsOpen(false)} 
                                className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                                variant="outline"
                            >
                                Done
                            </Button>
                        </div>
                    </ScrollArea>
                </SheetContent>
            </Sheet>
        );
     }


    const [title, subtitle] = padTitles[type].split(' ');

    return (
        <Card 
            className={cn(
                "flex flex-col h-full bg-card/50 border-2 border-transparent transition-all duration-300",
                (isLatchOn && type === 'bass') && "border-accent ring-2 ring-accent/50",
                isDisabled && "opacity-50 pointer-events-none"
            )}
            style={{ willChange: 'border-color, box-shadow' }}
        >
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between p-2">
                <div className="text-xs text-muted-foreground capitalize pl-2">
                   {type === 'melody' ? 'Theremin' : 'Bass Synth'}
                </div>
                <div className="flex items-center gap-2">
                     <TooltipProvider>
                        {renderSettingsControls()}
                    </TooltipProvider>
                    {type === 'bass' && onLatchToggle && (
                         <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center space-x-1 h-8 px-2 rounded-md hover:bg-accent/10">
                                        <Switch id="latch-mode" checked={isLatchOn} onCheckedChange={onLatchToggle} />
                                        <Label htmlFor="latch-mode" className="flex items-center gap-1 text-xs cursor-pointer"><Anchor className="w-3 h-3" /> Latch</Label>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent hidden={isMobile}>
                                    <p>Hold bass notes</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </CardHeader>
            <CardContent className="flex-grow p-0">
                <div
                    ref={padRef}
                    className="w-full h-full relative overflow-hidden cursor-crosshair touch-none theremin-pad"
                    id={`theremin-pad-${type}`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{
                        backgroundColor: 'hsl(var(--muted) / 0.2)',
                        backgroundImage: `linear-gradient(to top, transparent 30%, ${color}20)`,
                    }}
                >
                    <div className="absolute inset-0 flex items-center justify-center text-5xl md:text-7xl font-bold text-foreground/10 pointer-events-none uppercase tracking-widest text-center">
                        <div>
                            <span>{title}</span>
                            <br />
                            <span>{subtitle}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
