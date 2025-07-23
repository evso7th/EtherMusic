
"use client";

import type { PointerEvent } from 'react';
import { useRef, useCallback } from 'react';
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
    isLatched
}: ThereminPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const orbRef = useRef<HTMLDivElement>(null);
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
        
        if (orbRef.current) {
            orbRef.current.style.transform = `translate(${x}px, ${y}px)`;
        }

        return { frequency, volume };
    }, [frequencyRange]);


    const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!isPointerDown.current) return;
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            onInteraction(type, interactionData, 'move');
        }
    }, [calculateInteraction, onInteraction, type]);

    const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        isPointerDown.current = true;
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        if (orbRef.current) orbRef.current.style.opacity = '1';
        
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            onInteraction(type, interactionData, 'down');
        }
    }, [calculateInteraction, onInteraction, type]);

    const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!isPointerDown.current) return;
        isPointerDown.current = false;
        (event.target as HTMLElement).releasePointerCapture(event.pointerId);
        if (orbRef.current) orbRef.current.style.opacity = '0';
        onInteraction(type, null, 'up');
    }, [onInteraction, type]);
    
    return (
        <Card className={cn(
            "flex flex-col h-full bg-card/50 border-2 border-transparent transition-all duration-300",
            (isLatched) && type === 'bass' && "border-accent ring-4 ring-accent/50",
        )}>
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between p-4">
                <CardTitle className="text-xl font-bold" style={{ color }}>{title}</CardTitle>
                <div className="flex items-center gap-4">
                    {instruments && activeInstrument && onInstrumentChange && (
                        <Select value={activeInstrument} onValueChange={onInstrumentChange}>
                            <SelectTrigger className="w-[120px] capitalize">
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
                        <div className="flex items-center space-x-2">
                            <Switch id="latch-mode" checked={isLatchOn} onCheckedChange={onLatchToggle} />
                            <Label htmlFor="latch-mode" className="flex items-center gap-1"><Anchor className="w-4 h-4" /> Latch</Label>
                        </div>
                    )}
                    {onPulsateToggle && (
                         <Button
                            variant={(isPulsating || isLatched) ? 'default' : 'outline'}
                            size="icon"
                            onClick={onPulsateToggle}
                            className={cn('transition-all', (isPulsating || isLatched) && 'animate-pulse-accent')}
                            style={{ '--accent': 'hsl(var(--accent))' } as React.CSSProperties}

                         >
                             <Zap className="w-5 h-5" />
                         </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="flex-grow p-0">
                <div
                    ref={padRef}
                    className="w-full h-full relative overflow-hidden cursor-crosshair touch-none"
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerUp}
                    style={{
                        backgroundColor: 'hsl(var(--muted) / 0.2)',
                        backgroundSize: '4rem 4rem',
                        backgroundImage: `
                            linear-gradient(to right, hsl(var(--border) / 0.25) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(var(--border) / 0.25) 1px, transparent 1px)
                        `,
                    }}
                >
                    <div
                        ref={orbRef}
                        className={cn(
                            'absolute top-0 left-0 rounded-full w-12 h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity opacity-0',
                             (isPointerDown.current || isLatched) && 'opacity-100',
                             title.includes('Melody') ? 'animate-pulse-primary' : (isPulsating || isLatched) ? 'animate-pulse-accent' : ''
                        )}
                        style={{
                            backgroundColor: color,
                            animationDuration: '1s',
                        }}
                    />
                </div>
            </CardContent>
        </Card>
    );
}

    