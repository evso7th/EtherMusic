
"use client";

import type { PointerEvent } from 'react';
import { useRef, useCallback, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Zap, Anchor, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MelodyInstrument, MusicKey, MusicScale, Orb } from '@/app/page';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface ThereminPadProps {
    type: 'melody' | 'bass';
    onInteraction: (type: 'melody' | 'bass', params: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => void;
    frequencyRange: [number, number];
    color: string;
    isPolyphonic?: boolean;
    orbs: Orb[];
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
    isPulsating?: boolean;
    onPulsateToggle?: () => void;
    isLatchOn?: boolean;
    onLatchToggle?: (checked: boolean) => void;
}


const padTitles = {
    melody: "Melody Pad",
    bass: "Bass Pad"
}

const OrbComponent = ({ x, y, color, type }: { x: number, y: number, color: string, type: Orb['type'] }) => (
    <div
        className={cn(
            'absolute top-0 left-0 rounded-full w-8 h-8 md:w-12 md:h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity opacity-100',
            type === 'latch' && 'animate-pulse-primary'
        )}
        style={{
            backgroundColor: color,
            animationDuration: '1s',
            transform: `translate(${x}px, ${y}px)`,
            boxShadow: `0 0 20px ${color}, 0 0 30px ${color}`
        }}
    />
);

export function ThereminPad({ 
    type, 
    onInteraction, 
    frequencyRange, 
    color,
    isPolyphonic = false,
    orbs,
    isDisabled = false,
    isPulsating, 
    onPulsateToggle, 
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
                <Button variant="outline" size="sm" className="h-8 capitalize">
                    <SlidersHorizontal className="w-4 h-4 mr-0 sm:mr-2" />
                    <span className="hidden sm:inline">{activeInstrument || 'Settings'}</span>
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
                     <Button onClick={() => setIsSettingsOpen(false)} className="w-full">Done</Button>
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
            {onPulsateToggle && (
                 <Button
                    variant={isPulsating ? 'default' : 'outline'}
                    size="icon"
                    onClick={onPulsateToggle}
                    className={cn('transition-all w-8 h-8', isPulsating && 'animate-pulse-accent')}
                    style={{ '--accent': 'hsl(var(--accent))' } as React.CSSProperties}

                 >
                     <Zap className="w-4 h-4" />
                 </Button>
            )}
        </>
    );

    const [title, subtitle] = padTitles[type].split(' ');

    return (
        <Card className={cn(
            "flex flex-col h-full bg-card/50 border-2 border-transparent transition-all duration-300",
            (isLatchOn && type === 'bass') && "border-accent ring-4 ring-accent/50",
            isDisabled && "opacity-50 pointer-events-none"
        )}>
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-end p-2">
                <div className="flex items-center gap-2">
                   {type === 'melody' ? renderMelodyControls() : renderBassControls()}
                </div>
            </CardHeader>
            <CardContent className="flex-grow p-0">
                <div
                    ref={padRef}
                    className="w-full h-full relative overflow-hidden cursor-crosshair touch-none"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    style={{
                        backgroundColor: 'hsl(var(--muted) / 0.2)',
                        backgroundImage: `linear-gradient(to top, ${type === 'bass' ? 'hsl(var(--accent) / 0.2)' : 'hsl(var(--primary) / 0.2)'}, transparent 70%)`,
                    }}
                >
                    <div className="absolute inset-0 flex items-center justify-center text-5xl md:text-7xl font-bold text-foreground/10 pointer-events-none uppercase tracking-widest text-center">
                        <div>
                            <span>{title}</span>
                            <br />
                            <span>{subtitle}</span>
                        </div>
                    </div>
                     {orbs.map(orb => (
                        <OrbComponent key={orb.id} x={orb.x} y={orb.y} color={color} type={orb.type} />
                     ))}
                </div>
            </CardContent>
        </Card>
    );
}
