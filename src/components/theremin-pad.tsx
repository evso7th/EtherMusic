
"use client";

import type { PointerEvent } from 'react';
import { useRef, useEffect } from 'react';
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
    const isActive = useRef(false);

    const calculateInteraction = (event: PointerEvent<HTMLDivElement>) => {
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
    }

    const showOrb = (x: number, y: number) => {
        if (orbRef.current) {
            orbRef.current.style.transform = `translate(${x}px, ${y}px)`;
            orbRef.current.style.opacity = '1';
        }
    }

    const hideOrb = () => {
        if (orbRef.current) {
            orbRef.current.style.opacity = '0';
        }
    }

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!isActive.current || (isLatchOn && isLatched)) return;
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            showOrb(interactionData.x, interactionData.y);
            onInteraction(type, { frequency: interactionData.frequency, volume: interactionData.volume }, 'move');
        }
    };

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        isActive.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        const interactionData = calculateInteraction(event);
        if (interactionData) {
            if (!isLatchOn || (isLatchOn && !isLatched)) {
                showOrb(interactionData.x, interactionData.y);
            }
            onInteraction(type, { frequency: interactionData.frequency, volume: interactionData.volume }, 'down');
        }
    };

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (!isActive.current) return;
        isActive.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (!isLatchOn) {
            hideOrb();
        }
        onInteraction(type, null, 'up');
    };
    
    useEffect(() => {
        if (!isLatched && !isActive.current) {
            hideOrb();
        }
    }, [isLatched]);


    return (
        <Card className={cn(
            "flex flex-col h-full bg-card/50 border-2 border-transparent hover:border-primary transition-all duration-300",
            (isActive.current || isLatched) && type === 'bass' && "border-accent ring-4 ring-accent/50",
            (isActive.current) && type === 'melody' && "border-primary ring-4 ring-primary/50"
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
