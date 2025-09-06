
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum, Anchor } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import type { Volumes } from '@/types';

const InstrumentControls = ({
    label,
    icon: Icon,
    volume,
    onVolumeChange,
    onVolumeCommit,
}: {
    label: string,
    icon: React.ElementType,
    volume: number,
    onVolumeChange: (v: number) => void,
    onVolumeCommit: (v: number) => void,
}) => (
    <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary flex-shrink-0" />
            <Label className="text-sm font-medium flex-1 truncate">{label}</Label>
            <span className="text-xs text-muted-foreground w-10 text-right">{volume.toFixed(0)} dB</span>
        </div>
        <div className="flex items-center gap-4 pl-7">
            <Slider
                min={-48}
                max={6}
                step={1}
                value={[volume]}
                onValueChange={(v) => onVolumeChange(v[0])}
                onValueCommit={(v) => onVolumeCommit(v[0])}
            />
        </div>
    </div>
);


export function MixerControls({ initialVolumes, onVolumeChange }: { initialVolumes: Volumes, onVolumeChange: (volumes: Volumes) => void, isMobile: boolean }) {
    
    const [volumes, setVolumes] = useState(initialVolumes);

    useEffect(() => {
        setVolumes(initialVolumes);
    }, [initialVolumes]);

    const handleVolumeChange = useCallback((instrument: keyof Volumes, value: number) => {
        setVolumes(prev => ({ ...prev, [instrument]: value }));
    }, []);
    
    const handleVolumeCommit = useCallback((instrument: keyof Volumes, value: number) => {
        const newVolumes = { ...volumes, [instrument]: value };
        setVolumes(newVolumes);
        onVolumeChange(newVolumes);
    }, [volumes, onVolumeChange]);

    return (
        <div className="p-1 space-y-4">
            <div className="space-y-4">
                <InstrumentControls 
                    label="Melody"
                    icon={Music}
                    volume={volumes.melody}
                    onVolumeChange={(v) => handleVolumeChange('melody', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('melody', v)}
                />
                <InstrumentControls 
                    label="Bass"
                    icon={Waves}
                    volume={volumes.manualBass}
                    onVolumeChange={(v) => handleVolumeChange('manualBass', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('manualBass', v)}
                />
                <InstrumentControls 
                    label="Latch"
                    icon={Anchor}
                    volume={volumes.latch}
                    onVolumeChange={(v) => handleVolumeChange('latch', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('latch', v)}
                />
                <InstrumentControls 
                    label="Drums"
                    icon={Drum}
                    volume={volumes.drums}
                    onVolumeChange={(v) => handleVolumeChange('drums', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('drums', v)}
                />
            </div>
        </div>
    );
}

export function AutopilotMixerControls() {
    return null;
}
