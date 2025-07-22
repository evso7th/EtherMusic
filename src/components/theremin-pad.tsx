"use client";

import type { PointerEvent } from 'react';
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ThereminPadProps {
    title: string;
    onInteraction: (params: { frequency: number; volume: number } | null) => void;
    frequencyRange: [number, number];
    color: string;
}

export function ThereminPad({ title, onInteraction, frequencyRange, color }: ThereminPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const [isActive, setIsActive] = useState(false);
    const [orbPosition, setOrbPosition] = useState<{ x: number; y: number } | null>(null);

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!isActive || !padRef.current) return;
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

        setOrbPosition({ x, y });
        onInteraction({ frequency, volume });
    };

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        setIsActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        handlePointerMove(event);
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
            <CardHeader>
                <CardTitle className="text-2xl font-bold" style={{ color }}>{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow p-0">
                <div
                    ref={padRef}
                    className="w-full h-full min-h-[200px] md:min-h-[300px] relative overflow-hidden cursor-crosshair touch-none bg-grid"
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
                                title === 'Melody' ? 'animate-pulse-primary' : 'animate-pulse-accent'
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
