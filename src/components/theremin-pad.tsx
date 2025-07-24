
"use client";

import type { PointerEvent } from 'react';
import { useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Zap, Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MelodyInstrument, MusicKey, MusicScale } from '@/app/page';

interface ThereminPadProps {
    title: string;
    type: 'melody' | 'bass';
    onInteraction: (type: 'melody' | 'bass', params: { frequency: number; volume: number; pointerId: number } | null, state: 'down' | 'move' | 'up') => void;
    frequencyRange: [number, number];
    color: string;
    isPolyphonic?: boolean;
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
    isLatched?: boolean;
    latchedNotes?: Map<number, { frequency: number; volume: number }>;
}

interface PointerState {
    id: number;
    orb: HTMLDivElement;
    frequency: number;
}

export function ThereminPad({ 
    title,
    type, 
    onInteraction, 
    frequencyRange, 
    color,
    isPolyphonic = false,
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
    isLatched,
    latchedNotes,
}: ThereminPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const activePointers = useRef<Map<number, PointerState>>(new Map());
    
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


    const createOrb = (x: number, y: number) => {
        if (!padRef.current) return null;
        const orb = document.createElement('div');
        orb.className = cn(
            'absolute top-0 left-0 rounded-full w-8 h-8 md:w-12 md:h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity opacity-100',
            'animate-pulse-primary'
        );
        orb.style.backgroundColor = color;
        orb.style.animationDuration = '1s';
        orb.style.transform = `translate(${x}px, ${y}px)`;
        padRef.current.appendChild(orb);
        return orb;
    };


    const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        const interactionData = calculateInteraction(event);
        if (!interactionData) return;
        
        onInteraction(type, interactionData, 'down');

        if (isPolyphonic && (type === 'melody' || (type === 'bass' && !isLatchOn))) {
            const orb = createOrb(interactionData.x, interactionData.y);
            if(orb) {
                const newPointer = { id: event.pointerId, orb, frequency: interactionData.frequency };
                activePointers.current.set(event.pointerId, newPointer);
            }
        }
    }, [calculateInteraction, onInteraction, type, color, isPolyphonic, isLatchOn]);

    const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const interactionData = calculateInteraction(event);
        if (!interactionData) return;
        
        if (!activePointers.current.has(event.pointerId)) return;

        onInteraction(type, interactionData, 'move');

        const pointer = activePointers.current.get(event.pointerId);
        if (pointer && pointer.orb) {
            pointer.orb.style.transform = `translate(${interactionData.x}px, ${interactionData.y}px)`;
        }

    }, [calculateInteraction, onInteraction, type]);

    const handlePointerUpOrLeave = useCallback((event: PointerEvent<HTMLDivElement>) => {
        (event.target as HTMLElement).releasePointerCapture(event.pointerId);
        
        const pointer = activePointers.current.get(event.pointerId);
        if (pointer) {
             // For non-latched notes, we always send an 'up' interaction
            if (!(type === 'bass' && isLatchOn)) {
                onInteraction(type, { frequency: pointer.frequency, volume: 0, pointerId: event.pointerId}, 'up');
            }
            pointer.orb.remove();
            activePointers.current.delete(event.pointerId);
        } else if (type !== 'bass' || !isLatchOn) {
            // This handles cases where a pointer might exist without an orb (edge cases)
             const interactionData = calculateInteraction(event);
             if (interactionData) {
                onInteraction(type, interactionData, 'up');
             }
        }
    }, [onInteraction, type, isLatchOn, calculateInteraction]);
    
    useEffect(() => {
        if (type !== 'bass' || !isLatchOn || !latchedNotes || !padRef.current) return;
        
        const latchedIds = new Set(latchedNotes.keys());
        const currentOrbIds = new Set(activePointers.current.keys());

        // Remove orbs for notes that are no longer latched
        activePointers.current.forEach((pointer, id) => {
            if (!latchedIds.has(id)) {
                pointer.orb.remove();
                activePointers.current.delete(id);
            }
        });

        // Add or update orbs for latched notes
        latchedNotes.forEach((note, id) => {
            const rect = padRef.current?.getBoundingClientRect();
            if (!rect) return;

            const { frequency, volume } = note;
            const [minFreq, maxFreq] = frequencyRange;

            const logMin = Math.log(minFreq);
            const logMax = Math.log(maxFreq);
            const normalizedX = (Math.log(frequency) - logMin) / (logMax - logMin);
            const normalizedY = 1 - volume;

            const x = normalizedX * rect.width;
            const y = normalizedY * rect.height;

            let pointer = activePointers.current.get(id);
            if (!pointer) {
                const orb = createOrb(x, y);
                if (orb) {
                    pointer = { id, orb, frequency };
                    activePointers.current.set(id, pointer);
                }
            } else {
                 if (pointer.orb) {
                    pointer.orb.style.transform = `translate(${x}px, ${y}px)`;
                 }
            }
        });

    }, [latchedNotes, isLatchOn, frequencyRange, type, color]);


    const renderMelodyControls = () => (
        <>
            {musicKeys && activeKey && onKeyChange && (
                 <Select value={activeKey} onValueChange={onKeyChange}>
                    <SelectTrigger className="w-[60px] h-8 text-xs">
                        <SelectValue placeholder="Key" />
                    </SelectTrigger>
                    <SelectContent>
                        {musicKeys.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                </Select>
            )}
            {musicScales && activeScale && onScaleChange && (
                 <Select value={activeScale} onValueChange={onScaleChange}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue placeholder="Scale" />
                    </SelectTrigger>
                    <SelectContent>
                        {musicScales.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                </Select>
            )}
            {instruments && activeInstrument && onInstrumentChange && (
                <Select value={activeInstrument} onValueChange={onInstrumentChange}>
                    <SelectTrigger className="w-[90px] capitalize h-8 text-xs">
                        <SelectValue placeholder="Instrument" />
                    </SelectTrigger>
                    <SelectContent>
                        {instruments.map(inst => (
                            <SelectItem key={inst} value={inst} className="capitalize">{inst}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </>
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
                    variant={(isPulsating || isLatched) ? 'default' : 'outline'}
                    size="icon"
                    onClick={onPulsateToggle}
                    className={cn('transition-all w-8 h-8', (isPulsating || isLatched) && 'animate-pulse-accent')}
                    style={{ '--accent': 'hsl(var(--accent))' } as React.CSSProperties}

                 >
                     <Zap className="w-4 h-4" />
                 </Button>
            )}
        </>
    );

    return (
        <Card className={cn(
            "flex flex-col h-full bg-card/50 border-2 border-transparent transition-all duration-300",
            (isLatched) && type === 'bass' && "border-accent ring-4 ring-accent/50",
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
                    onPointerUp={handlePointerUpOrLeave}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerUpOrLeave}
                    style={{
                        backgroundColor: 'hsl(var(--muted) / 0.2)',
                        backgroundSize: '2rem 2rem md:4rem 4rem',
                        backgroundImage: `
                            linear-gradient(to right, hsl(var(--border) / 0.25) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(var(--border) / 0.25) 1px, transparent 1px)
                        `,
                    }}
                >
                    <div className="absolute inset-0 flex items-center justify-center text-5xl md:text-7xl font-bold text-foreground/10 pointer-events-none uppercase tracking-widest">
                        {title}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
