
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum, Anchor, Blend } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import type { Volumes, ChannelVolumes } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "./ui/separator";

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

const ReverbSendControl = ({
    label,
    icon: Icon,
    level,
    onLevelChange,
    onLevelCommit,
}: {
    label: string,
    icon: React.ElementType,
    level: number,
    onLevelChange: (v: number) => void,
    onLevelCommit: (v: number) => void,
}) => (
     <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-accent flex-shrink-0" />
            <Label className="text-sm font-medium flex-1 truncate">{label}</Label>
            <span className="text-xs text-muted-foreground w-10 text-right">{level.toFixed(0)} dB</span>
        </div>
        <div className="flex items-center gap-4 pl-7">
            <Slider
                min={-48}
                max={6}
                step={1}
                value={[level]}
                onValueChange={(v) => onLevelChange(v[0])}
                onValueCommit={(v) => onLevelCommit(v[0])}
            />
        </div>
    </div>
);

export function MixerControls({ volumes: initialVolumes, onVolumeChange }: { volumes: Volumes, onVolumeChange: (volumes: Volumes) => void, isMobile: boolean }) {
    
    const [volumes, setVolumes] = useState(initialVolumes);

    useEffect(() => {
        setVolumes(initialVolumes);
    }, [initialVolumes]);

    const handleGainChange = useCallback((instrument: keyof Omit<Volumes, 'reverbReturn'>, value: number) => {
        setVolumes(prev => ({
            ...prev,
            [instrument]: { ...prev[instrument], gain: value }
        }));
    }, []);
    
    const handleGainCommit = useCallback((instrument: keyof Omit<Volumes, 'reverbReturn'>, value: number) => {
        const newVolumes = {
            ...volumes,
            [instrument]: { ...volumes[instrument], gain: value }
        };
        setVolumes(newVolumes);
        onVolumeChange(newVolumes);
    }, [volumes, onVolumeChange]);
    
    const handleReverbSendChange = useCallback((instrument: keyof Omit<Volumes, 'reverbReturn'>, value: number) => {
        setVolumes(prev => ({
            ...prev,
            [instrument]: { ...prev[instrument], reverbSend: value }
        }));
    }, []);

    const handleReverbSendCommit = useCallback((instrument: keyof Omit<Volumes, 'reverbReturn'>, value: number) => {
        const newVolumes = {
            ...volumes,
            [instrument]: { ...volumes[instrument], reverbSend: value }
        };
        setVolumes(newVolumes);
        onVolumeChange(newVolumes);
    }, [volumes, onVolumeChange]);

    const handleReverbReturnChange = useCallback((value: number) => {
        setVolumes(prev => ({ ...prev, reverbReturn: value }));
    }, []);

     const handleReverbReturnCommit = useCallback((value: number) => {
        const newVolumes = { ...volumes, reverbReturn: value };
        setVolumes(newVolumes);
        onVolumeChange(newVolumes);
    }, [volumes, onVolumeChange]);


    return (
        <Tabs defaultValue="volumes" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="volumes">Volumes</TabsTrigger>
                <TabsTrigger value="effects">Effects</TabsTrigger>
            </TabsList>
            <TabsContent value="volumes" className="p-1 space-y-4">
                 <VolumeControl 
                    label="Melody"
                    icon={Music}
                    volume={volumes.melody.gain}
                    onVolumeChange={(v) => handleGainChange('melody', v)}
                    onVolumeCommit={(v) => handleGainCommit('melody', v)}
                />
                <VolumeControl 
                    label="Bass"
                    icon={Waves}
                    volume={volumes.manualBass.gain}
                    onVolumeChange={(v) => handleGainChange('manualBass', v)}
                    onVolumeCommit={(v) => handleGainCommit('manualBass', v)}
                />
                <VolumeControl 
                    label="Latch"
                    icon={Anchor}
                    volume={volumes.latch.gain}
                    onVolumeChange={(v) => handleGainChange('latch', v)}
                    onVolumeCommit={(v) => handleGainCommit('latch', v)}
                />
                <VolumeControl 
                    label="Drums"
                    icon={Drum}
                    volume={volumes.drums.gain}
                    onVolumeChange={(v) => handleGainChange('drums', v)}
                    onVolumeCommit={(v) => handleGainCommit('drums', v)}
                />
            </TabsContent>
            <TabsContent value="effects" className="p-1 space-y-4">
                 <VolumeControl 
                    label="Reverb Mix"
                    icon={Blend}
                    volume={volumes.reverbReturn}
                    onVolumeChange={handleReverbReturnChange}
                    onVolumeCommit={handleReverbReturnCommit}
                />
                <Separator className="my-4" />
                 <ReverbSendControl 
                    label="Melody Send"
                    icon={Music}
                    level={volumes.melody.reverbSend}
                    onLevelChange={(v) => handleReverbSendChange('melody', v)}
                    onLevelCommit={(v) => handleReverbSendCommit('melody', v)}
                />
                 <ReverbSendControl 
                    label="Bass Send"
                    icon={Waves}
                    level={volumes.manualBass.reverbSend}
                    onLevelChange={(v) => handleReverbSendChange('manualBass', v)}
                    onLevelCommit={(v) => handleReverbSendCommit('manualBass', v)}
                />
                 <ReverbSendControl 
                    label="Latch Send"
                    icon={Anchor}
                    level={volumes.latch.reverbSend}
                    onLevelChange={(v) => handleReverbSendChange('latch', v)}
                    onLevelCommit={(v) => handleReverbSendCommit('latch', v)}
                />
                 <ReverbSendControl 
                    label="Drums Send"
                    icon={Drum}
                    level={volumes.drums.reverbSend}
                    onLevelChange={(v) => handleReverbSendChange('drums', v)}
                    onLevelCommit={(v) => handleReverbSendCommit('drums', v)}
                />
            </TabsContent>
        </Tabs>
    );
}
