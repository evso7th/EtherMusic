"use client";

import type { PointerEvent } from 'react';
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThereminPadProps {
    title: string;
    onInteraction: (params: { frequency: number; volume: number } | null) => void;
    frequencyRange: [number, number];
    color: string;
    isPulsating?: boolean;
    onPulsateToggle?: () => void;
}

export function ThereminPad({ title, onInteraction, frequencyRange, color, isPulsating, onPulsateToggle }: ThereminPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const [isActive, setIsActive] = useState(false);
    const [orbPosition, setOrbPosition] = useState<{ x: number; y: number } | null>(null);

    const calculateInteraction = (event: PointerEvent<HTMLDivElement>) => {
        if (!padRef.current) return null;
        const rect = padRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const normalizedX = Math.min(Math.max(x / rect.width, 0), 1);
        const normalizedY = Math.min(Math.max(y / rect.height, 0), 1);

        // Logarithmic scale for frequency (more musical)
        const [minFreq, maxFreq] = frequencyRange;
        const frequency = minFreq * Math.pow(maxFreq / minFreq, normalizedX);
        
        // Linear scale for volume (y-axis, inverted)
        const volume = 1 - normalizedY;

        return { x, y, frequency, volume };
    }

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!isActive) return;
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
            setOrbPosition({ x: interactionData.x, y: interactionData.y });
            onInteraction({ frequency: interactionData.frequency, volume: interactionData.volume });
        }
    };

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        setIsActive(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
        setOrbPosition(null);
        onInteraction(null);
    };

    const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
        if (isActive) {
            setIsActive(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
            setOrbPosition(null);
            onInteraction(null);
        }
    };
    
    return (
        <Card className="flex flex-col h-full bg-card/50 border-2 border-transparent hover:border-primary transition-all duration-300">
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between">
                <CardTitle className="text-2xl font-bold" style={{ color }}>{title}</CardTitle>
                {onPulsateToggle && (
                     <Button
                        variant={isPulsating ? 'default' : 'outline'}
                        size="icon"
                        onClick={onPulsateToggle}
                        className={cn('transition-all', isPulsating && 'animate-pulse-accent')}
                        style={{ '--accent': 'hsl(var(--accent))' } as React.CSSProperties}

                     >
                         <Zap className="w-5 h-5" />
                     </Button>
                )}
            </CardHeader>
            <CardContent className="flex-grow p-0">
                <div
                    ref={padRef}
                    className="w-full h-full relative overflow-hidden cursor-crosshair touch-none bg-grid"
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerLeave}
                    style={{
                        backgroundSize: '2rem 2rem',
                        backgroundImage: `radial-gradient(hsl(var(--border) / 0.5) 1px, transparent 1px)`,
                    }}
                >
                    {isActive && orbPosition && (
                        <div
                            className={cn(
                                'absolute rounded-full w-12 h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
                                title.includes('Melody') ? 'animate-pulse-primary' : 'animate-pulse-accent'
                            )}
                            style={{
                                left: orbPosition.x,
                                top: orbPosition.y,
                                backgroundColor: color,
                            }}
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
