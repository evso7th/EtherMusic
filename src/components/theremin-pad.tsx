

"use client";

import type { PointerEvent } from 'react';
import { useRef, useCallback, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Anchor, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MelodyInstrument, MusicKey, MusicScale } from '@/app/page';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface ThereminPadProps {
    type: 'melody' | 'bass';
    onInteraction: (type: 'melody' | 'bass', params: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => void;
    frequencyRange: [number, number];
    color: string;
    isPolyphonic?: boolean;
    isDisabled?: boolean;
    // Melody specific
    instruments?: MelodyInstrument[];
    activeInstrument?: MelodyInstrument;
    onInstrumentChange?: (instrument: MelodyInstrument) => void;
    musicKeys?: MusicKey[];
    activeKey?: MusicKey;
    onKeyChange?: (key: MusicKey) => void;
    musicScales?: MusicScale[];
    activeScale?: MusicScale;
    onScaleChange?: (scale: MusicScale) => void;
    // Bass specific
    isLatchOn?: boolean;
    onLatchToggle?: (checked: boolean) => void;
}


const padTitles = {
    melody: "Melody Pad",
    bass: "Bass Pad"
}

export function ThereminPad({ 
    type, 
    onInteraction, 
    frequencyRange, 
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
}: ThereminPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const calculateInteraction = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!padRef.current) return null;
        const rect = padRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const normalizedX = Math.min(Math.max(x / rect.width, 0), 1);
        const normalizedY = Math.min(Math.max(y / rect.height, 0), 1);

        const [minFreq, maxFreq] = frequencyRange;
        const logMin = Math.log(minFreq);
        const logMax = Math.log(maxFreq);
        const frequency = Math.exp(logMin + (logMax - logMin) * normalizedX);
        
        const volume = 1 - normalizedY;
        
        return { x, y, frequency, volume, pointerId: event.pointerId };
    }, [frequencyRange]);
    

    const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (isDisabled) return;
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            onInteraction(type, interactionData, 'down');
        }
    }, [calculateInteraction, onInteraction, type, isDisabled]);

    const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (isDisabled || !(event.buttons > 0)) return;
        
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            onInteraction(type, interactionData, 'move');
        }
    }, [calculateInteraction, onInteraction, type, isDisabled]);

    const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (isDisabled) return;
        const interactionData = calculateInteraction(event);
        onInteraction(type, interactionData, 'up');
        
        if ((event.target as HTMLElement).hasPointerCapture(event.pointerId)) {
            (event.target as HTMLElement).releasePointerCapture(event.pointerId);
        }
    }, [onInteraction, type, calculateInteraction, isDisabled]);
    
    const renderMelodyControls = () => (
        <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 capitalize border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                    <SlidersHorizontal className="w-4 h-4 mr-0 sm:mr-2" />
                    <span className="hidden sm:inline">Settings</span>
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Melody Settings</SheetTitle>
                </SheetHeader>
                <div className="py-4 space-y-6">
                    {musicKeys && activeKey && onKeyChange && (
                        <div className="space-y-2">
                             <Label>Music Key</Label>
                             <Select value={activeKey} onValueChange={onKeyChange}>
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
                             <Select value={activeScale} onValueChange={onScaleChange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Scale" />
                                </SelectTrigger>
                                <SelectContent>
                                    {musicScales.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {instruments && activeInstrument && onInstrumentChange && (
                        <div className="space-y-2">
                            <Label>Instrument</Label>
                            <Select value={activeInstrument} onValueChange={onInstrumentChange}>
                                <SelectTrigger className="capitalize">
                                    <SelectValue placeholder="Instrument" />
                                </SelectTrigger>
                                <SelectContent>
                                    {instruments.map(inst => (
                                        <SelectItem key={inst} value={inst} className="capitalize">{inst}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                     <Button 
                        onClick={() => setIsSettingsOpen(false)} 
                        className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                        variant="outline"
                    >
                        Done
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );

    const renderBassControls = () => (
        <>
            {onLatchToggle && (
                <div className="flex items-center space-x-1">
                    <Switch id="latch-mode" checked={isLatchOn} onCheckedChange={onLatchToggle} />
                    <Label htmlFor="latch-mode" className="flex items-center gap-1 text-xs"><Anchor className="w-3 h-3" /> Latch</Label>
                </div>
            )}
        </>
    );

    const [title, subtitle] = padTitles[type].split(' ');

    return (
        <Card 
            className={cn(
                "flex flex-col h-full bg-card/50 border-2 border-transparent transition-all duration-300",
                (isLatchOn && type === 'bass') && "border-accent ring-4 ring-accent/50",
                isDisabled && "opacity-50 pointer-events-none"
            )}
            style={{ willChange: 'border-color, box-shadow' }}
        >
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-end p-2">
                <div className="flex items-center gap-2">
                   {type === 'melody' ? renderMelodyControls() : renderBassControls()}
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
                    style={{
                        backgroundColor: 'hsl(var(--muted) / 0.2)',
                        backgroundImage: `linear-gradient(to top, transparent 30%, hsl(var(--primary) / 0.2))`,
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
