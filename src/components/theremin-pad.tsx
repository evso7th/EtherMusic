
"use client";

import type { PointerEvent } from 'react';
import { useState, useRef } from 'react';
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
    onInteraction: (params: { frequency: number; volume: number } | null) => void;
    onPointerUp: (frequency: number | null) => void;
    frequencyRange: [number, number];
    color: string;
    // Pulsation props
    isPulsating?: boolean;
    onPulsateToggle?: () => void;
    // Instrument props
    instruments?: MelodyInstrument[];
    activeInstrument?: MelodyInstrument;
    onInstrumentChange?: (instrument: MelodyInstrument) => void;
    // Latch props
    isLatchOn?: boolean;
    onLatchToggle?: (checked: boolean) => void;
    isLatched?: boolean;
}

export function ThereminPad({ 
    title, 
    onInteraction, 
    onPointerUp, 
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
    const [isActive, setIsActive] = useState(false);
    const [orbPosition, setOrbPosition] = useState<{ x: number; y: number } | null>(null);
    const lastFrequency = useRef<number | null>(null);

    const calculateInteraction = (event: PointerEvent<HTMLDivElement>) => {
        if (!padRef.current) return null;
        const rect = padRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const normalizedX = Math.min(Math.max(x / rect.width, 0), 1);
        const normalizedY = Math.min(Math.max(y / rect.height, 0), 1);

        const [minFreq, maxFreq] = frequencyRange;
        const frequency = minFreq * Math.pow(maxFreq / minFreq, normalizedX);
        
        const volume = 1 - normalizedY;
        
        lastFrequency.current = frequency;
        return { x, y, frequency, volume };
    }

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!isActive || (isLatchOn && isLatched)) return;
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            setOrbPosition({ x: interactionData.x, y: interactionData.y });
            onInteraction({ frequency: interactionData.frequency, volume: interactionData.volume });
        }
    };

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        setIsActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            if (!isLatchOn || (isLatchOn && !isLatched)) {
                 setOrbPosition({ x: interactionData.x, y: interactionData.y });
            }
            onInteraction({ frequency: interactionData.frequency, volume: interactionData.volume });
        }
    };

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        setIsActive(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (!isLatchOn) {
            setOrbPosition(null);
            onInteraction(null);
        }
        onPointerUp(lastFrequency.current);
        lastFrequency.current = null;
    };

    const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
        if (isActive) {
             if (!isLatchOn) {
                setIsActive(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
                setOrbPosition(null);
                onInteraction(null);
                onPointerUp(lastFrequency.current);
                lastFrequency.current = null;
            }
        }
    };
    
    return (
        <Card className={cn(
            "flex flex-col h-full bg-card/50 border-2 border-transparent hover:border-primary transition-all duration-300",
            (isActive || isLatched) && title.includes('Bass') && "border-accent ring-4 ring-accent/50",
            (isActive) && title.includes('Melody') && "border-primary ring-4 ring-primary/50"

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
                    onPointerLeave={handlePointerLeave}
                    style={{
                        backgroundColor: 'hsl(var(--muted) / 0.2)',
                        backgroundSize: '4rem 4rem',
                        backgroundImage: `
                            linear-gradient(to right, hsl(var(--border) / 0.25) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(var(--border) / 0.25) 1px, transparent 1px)
                        `,
                    }}
                >
                    {(isActive || isLatched) && orbPosition && (
                        <div
                            className={cn(
                                'absolute rounded-full w-12 h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
                                title.includes('Melody') ? 'animate-pulse-primary' : (isPulsating || isLatched) ? 'animate-pulse-accent' : ''
                            )}
                            style={{
                                left: orbPosition.x,
                                top: orbPosition.y,
                                backgroundColor: color,
                                animationDuration: '1s',
                            }}
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
