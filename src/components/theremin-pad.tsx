
"use client";

import type { PointerEvent } from 'react';
import { useRef, useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Zap, Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MelodyInstrument } from '@/app/page';

interface ThereminPadProps {
    title: string;
    type: 'melody' | 'bass';
    onInteraction: (type: 'melody' | 'bass', params: { frequency: number; volume: number } | null, state: 'down' | 'move' | 'up') => void;
    frequencyRange: [number, number];
    color: string;
    isPulsating?: boolean;
    onPulsateToggle?: () => void;
    instruments?: MelodyInstrument[];
    activeInstrument?: MelodyInstrument;
    onInstrumentChange?: (instrument: MelodyInstrument) => void;
    isLatchOn?: boolean;
    onLatchToggle?: (checked: boolean) => void;
    isLatched?: boolean;
    latchedNotePosition?: { frequency: number; volume: number } | null;
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
    isPulsating, 
    onPulsateToggle, 
    instruments, 
    activeInstrument, 
    onInstrumentChange,
    isLatchOn,
    onLatchToggle,
    isLatched,
    latchedNotePosition,
}: ThereminPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const activePointers = useRef<Map<number, PointerState>>(new Map());
    
    // For bass theremin which is monophonic
    const bassOrbRef = useRef<HTMLDivElement>(null);
    const isPointerDown = useRef(false);

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
        
        return { x, y, frequency, volume };
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

        if (type === 'melody') {
            const orb = createOrb(interactionData.x, interactionData.y);
            if(orb) {
                const newPointer = { id: event.pointerId, orb, frequency: interactionData.frequency };
                activePointers.current.set(event.pointerId, newPointer);
            }
        } else {
            isPointerDown.current = true;
            if (bassOrbRef.current && !isLatched) {
                bassOrbRef.current.style.opacity = '1';
                bassOrbRef.current.style.transform = `translate(${interactionData.x}px, ${interactionData.y}px)`;
            }
        }
    }, [calculateInteraction, onInteraction, type, isLatched, color]);

    const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const interactionData = calculateInteraction(event);
        if (!interactionData) return;
        
        onInteraction(type, interactionData, 'move');

        if (type === 'melody') {
            const pointer = activePointers.current.get(event.pointerId);
            if (pointer && pointer.orb) {
                pointer.orb.style.transform = `translate(${interactionData.x}px, ${interactionData.y}px)`;
            }
        } else {
            if (isPointerDown.current) {
                 if (bassOrbRef.current) {
                    bassOrbRef.current.style.transform = `translate(${interactionData.x}px, ${interactionData.y}px)`;
                 }
            }
        }

    }, [calculateInteraction, onInteraction, type]);

    const handlePointerUpOrLeave = useCallback((event: PointerEvent<HTMLDivElement>) => {
        (event.target as HTMLElement).releasePointerCapture(event.pointerId);
        
        if (type === 'melody') {
            const pointer = activePointers.current.get(event.pointerId);
            if (pointer) {
                onInteraction(type, { frequency: pointer.frequency, volume: 0}, 'up');
                pointer.orb.remove();
                activePointers.current.delete(event.pointerId);
            }
        } else {
            if (isPointerDown.current) {
                isPointerDown.current = false;
                if (bassOrbRef.current && !isLatched) {
                    bassOrbRef.current.style.opacity = '0';
                }
                onInteraction(type, null, 'up');
            }
        }
    }, [onInteraction, type, isLatched]);
    
    useEffect(() => {
        if (type === 'bass' && !padRef.current || !bassOrbRef.current) return;

        if (latchedNotePosition) {
            const rect = padRef.current!.getBoundingClientRect();
            const { frequency, volume } = latchedNotePosition;
            const [minFreq, maxFreq] = frequencyRange;

            const logMin = Math.log(minFreq);
            const logMax = Math.log(maxFreq);
            const normalizedX = (Math.log(frequency) - logMin) / (logMax - logMin);
            const normalizedY = 1 - volume;

            const x = normalizedX * rect.width;
            const y = normalizedY * rect.height;
            
            bassOrbRef.current!.style.transform = `translate(${x}px, ${y}px)`;
            bassOrbRef.current!.style.opacity = '1';
        } else {
             if (!isPointerDown.current) {
                if(bassOrbRef.current) bassOrbRef.current.style.opacity = '0';
             }
        }
    }, [latchedNotePosition, frequencyRange, type]);

    return (
        <Card className={cn(
            "flex flex-col h-full bg-card/50 border-2 border-transparent transition-all duration-300",
            (isLatched) && type === 'bass' && "border-accent ring-4 ring-accent/50",
        )}>
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between p-2 md:p-3">
                <CardTitle className="text-base md:text-lg font-bold" style={{ color }}>{title}</CardTitle>
                <div className="flex items-center gap-2 md:gap-4">
                    {instruments && activeInstrument && onInstrumentChange && (
                        <Select value={activeInstrument} onValueChange={onInstrumentChange}>
                            <SelectTrigger className="w-[90px] md:w-[120px] capitalize h-8 md:h-9 text-xs md:text-sm">
                                <SelectValue placeholder="Instrument" />
                            </SelectTrigger>
                            <SelectContent>
                                {instruments.map(inst => (
                                    <SelectItem key={inst} value={inst} className="capitalize">{inst}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                     {onLatchToggle && (
                        <div className="flex items-center space-x-1 md:space-x-2">
                            <Switch id="latch-mode" checked={isLatchOn} onCheckedChange={onLatchToggle} />
                            <Label htmlFor="latch-mode" className="flex items-center gap-1 text-xs md:text-sm"><Anchor className="w-3 h-3 md:w-4 md:h-4" /> Latch</Label>
                        </div>
                    )}
                    {onPulsateToggle && (
                         <Button
                            variant={(isPulsating || isLatched) ? 'default' : 'outline'}
                            size="icon"
                            onClick={onPulsateToggle}
                            className={cn('transition-all w-8 h-8 md:w-9 md:h-9', (isPulsating || isLatched) && 'animate-pulse-accent')}
                            style={{ '--accent': 'hsl(var(--accent))' } as React.CSSProperties}

                         >
                             <Zap className="w-4 h-4 md:w-5 md:h-5" />
                         </Button>
                    )}
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
                    {type === 'bass' && <div
                        ref={bassOrbRef}
                        className={cn(
                            'absolute top-0 left-0 rounded-full w-8 h-8 md:w-12 md:h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity opacity-0',
                             (isPointerDown.current || isLatched) && 'opacity-100',
                             (isPulsating || isLatched) ? 'animate-pulse-accent' : ''
                        )}
                        style={{
                            backgroundColor: color,
                            animationDuration: '1s',
                        }}
                    />}
                </div>
            </CardContent>
        </Card>
    );
}
