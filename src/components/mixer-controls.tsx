
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Waves, Drum, Anchor, Blend } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import type { Volumes } from '@/types';

const VolumeControl = ({
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


export function MixerControls({ volumes: initialVolumes, onVolumeChange }: { volumes: Volumes, onVolumeChange: (volumes: Omit<Volumes, 'melody' | 'manualBass'>) => void }) {
    
    const [volumes, setVolumes] = useState(initialVolumes);

    useEffect(() => {
        setVolumes(initialVolumes);
    }, [initialVolumes]);

    const handleLocalVolumeChange = useCallback(<K extends keyof typeof volumes>(instrument: K, field: keyof (typeof volumes)[K], value: number) => {
        setVolumes(prev => {
            const newVolumes = { ...prev };
            if (typeof newVolumes[instrument] === 'object') {
                (newVolumes[instrument] as any)[field] = value;
            } else {
                (newVolumes[instrument] as any) = value;
            }
            return newVolumes;
        });
    }, []);

    const handleCommit = useCallback(() => {
        const { melody, manualBass, ...mixerVolumes } = volumes;
        onVolumeChange(mixerVolumes);
    }, [volumes, onVolumeChange]);

    return (
        <div className="space-y-4">
             <VolumeControl 
                label="Latch"
                icon={Anchor}
                volume={volumes.latch.gain}
                onVolumeChange={(v) => handleLocalVolumeChange('latch', 'gain', v)}
                onVolumeCommit={handleCommit}
            />
            <VolumeControl 
                label="Drums"
                icon={Drum}
                volume={volumes.drums.gain}
                onVolumeChange={(v) => handleLocalVolumeChange('drums', 'gain', v)}
                onVolumeCommit={handleCommit}
            />
             <VolumeControl 
                label="Reverb Mix"
                icon={Blend}
                volume={volumes.reverbReturn}
                onVolumeChange={(v) => handleLocalVolumeChange('reverbReturn', 'reverbReturn' as any, v)}
                onVolumeCommit={handleCommit}
            />
        </div>
    );
}

    