
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum, Bot, Anchor, Sparkles, GitCompareArrows, Guitar } from 'lucide-react';
import { Separator } from './ui/separator';
import { useState, useCallback } from 'react';
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { SlidersHorizontal } from 'lucide-react';
import { cn } from "@/lib/utils";

type Volumes = { 
    melody: number; 
    manualBass: number;
    latch: number; 
    drums: number; 
    autopilot: number;
    accompaniment: number;
    autopilotBass: number;
    effects: number;
    ebass: number;
};

type Effects = {
    melody: { reverb: number, delay: number };
    manualBass: { reverb: number, delay: number };
    latch: { reverb: number, delay: number };
    drums: { reverb: number, delay: number };
    autopilot: { reverb: number, delay: number };
    accompaniment: { reverb: number, delay: number };
    autopilotBass: { reverb: number, delay: number };
    effects: { reverb: number, delay: number };
    ebass: { reverb: number, delay: number };
};

interface MixerControlsProps {
    initialVolumes: Volumes;
    onVolumeChange: (volumes: Volumes) => void;
    initialEffects: Effects;
    onEffectChange: (effects: Effects) => void;
    isMobile: boolean;
}

const EffectSlider = ({ label, value, onValueChange, onCommit, min = -60, max = 0, step = 1 }: { 
    label: string; 
    value: number;
    onValueChange: (value: number) => void;
    onCommit: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) => (
    <div className="flex-1 space-y-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Slider
            min={min}
            max={max}
            step={step}
            value={[value]}
            onValueChange={(v) => onValueChange(v[0])}
            onValueCommit={(v) => onCommit(v[0])}
        />
    </div>
);

const InstrumentControls = ({
    label,
    icon: Icon,
    volume,
    reverb,
    delay,
    onVolumeChange,
    onVolumeCommit,
    onReverbChange,
    onReverbCommit,
    onDelayChange,
    onDelayCommit,
}: {
    label: string,
    icon: React.ElementType,
    volume: number,
    reverb: number,
    delay: number,
    onVolumeChange: (v: number) => void,
    onVolumeCommit: (v: number) => void,
    onReverbChange: (v: number) => void,
    onReverbCommit: (v: number) => void,
    onDelayChange: (v: number) => void,
    onDelayCommit: (v: number) => void,
}) => (
    <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary flex-shrink-0" />
            <Label className="text-sm font-medium flex-1 truncate">{label}</Label>
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
        <div className="flex gap-4 pl-7">
            <EffectSlider label="Reverb" value={reverb} onValueChange={onReverbChange} onCommit={onReverbCommit} />
            <EffectSlider label="Delay" value={delay} onValueChange={onDelayChange} onCommit={onDelayCommit} />
        </div>
    </div>
);


export function MixerControls({ initialVolumes, onVolumeChange, initialEffects, onEffectChange }: MixerControlsProps) {
    
    const [volumes, setVolumes] = useState(initialVolumes);
    const [effects, setEffects] = useState(initialEffects);

    const handleVolumeChange = useCallback((instrument: keyof Volumes, value: number) => {
        setVolumes(prev => ({ ...prev, [instrument]: value }));
    }, []);
    
    const handleVolumeCommit = useCallback((instrument: keyof Volumes, value: number) => {
        const newVolumes = { ...volumes, [instrument]: value };
        setVolumes(newVolumes);
        onVolumeChange(newVolumes);
    }, [volumes, onVolumeChange]);

    const handleEffectChange = useCallback((instrument: keyof Effects, effect: 'reverb' | 'delay', value: number) => {
        setEffects(prev => ({ ...prev, [instrument]: { ...prev[instrument], [effect]: value }}));
    }, []);
    
    const handleEffectCommit = useCallback((instrument: keyof Effects, effect: 'reverb' | 'delay', value: number) => {
        const newEffects = { ...effects, [instrument]: { ...effects[instrument], [effect]: value }};
        setEffects(newEffects);
        onEffectChange(newEffects);
    }, [effects, onEffectChange]);

    return (
        <div className="p-1 space-y-4">
            <div className="space-y-4">
                <InstrumentControls 
                    label="Melody"
                    icon={Music}
                    volume={volumes.melody}
                    reverb={effects.melody.reverb}
                    delay={effects.melody.delay}
                    onVolumeChange={(v) => handleVolumeChange('melody', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('melody', v)}
                    onReverbChange={(v) => handleEffectChange('melody', 'reverb', v)}
                    onReverbCommit={(v) => handleEffectCommit('melody', 'reverb', v)}
                    onDelayChange={(v) => handleEffectChange('melody', 'delay', v)}
                    onDelayCommit={(v) => handleEffectCommit('melody', 'delay', v)}
                />
                <InstrumentControls 
                    label="Bass"
                    icon={Waves}
                    volume={volumes.manualBass}
                    reverb={effects.manualBass.reverb}
                    delay={effects.manualBass.delay}
                    onVolumeChange={(v) => handleVolumeChange('manualBass', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('manualBass', v)}
                    onReverbChange={(v) => handleEffectChange('manualBass', 'reverb', v)}
                    onReverbCommit={(v) => handleEffectCommit('manualBass', 'reverb', v)}
                    onDelayChange={(v) => handleEffectChange('manualBass', 'delay', v)}
                    onDelayCommit={(v) => handleEffectCommit('manualBass', 'delay', v)}
                />
                 <InstrumentControls 
                    label="E.Bass"
                    icon={Guitar}
                    volume={volumes.ebass}
                    reverb={effects.ebass.reverb}
                    delay={effects.ebass.delay}
                    onVolumeChange={(v) => handleVolumeChange('ebass', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('ebass', v)}
                    onReverbChange={(v) => handleEffectChange('ebass', 'reverb', v)}
                    onReverbCommit={(v) => handleEffectCommit('ebass', 'reverb', v)}
                    onDelayChange={(v) => handleEffectChange('ebass', 'delay', v)}
                    onDelayCommit={(v) => handleEffectCommit('ebass', 'delay', v)}
                />
                <InstrumentControls 
                    label="Latch"
                    icon={Anchor}
                    volume={volumes.latch}
                    reverb={effects.latch.reverb}
                    delay={effects.latch.delay}
                    onVolumeChange={(v) => handleVolumeChange('latch', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('latch', v)}
                    onReverbChange={(v) => handleEffectChange('latch', 'reverb', v)}
                    onReverbCommit={(v) => handleEffectCommit('latch', 'reverb', v)}
                    onDelayChange={(v) => handleEffectChange('latch', 'delay', v)}
                    onDelayCommit={(v) => handleEffectCommit('latch', 'delay', v)}
                />
                <InstrumentControls 
                    label="Drums"
                    icon={Drum}
                    volume={volumes.drums}
                    reverb={effects.drums.reverb}
                    delay={effects.drums.delay}
                    onVolumeChange={(v) => handleVolumeChange('drums', v)}
                    onVolumeCommit={(v) => handleVolumeCommit('drums', v)}
                    onReverbChange={(v) => handleEffectChange('drums', 'reverb', v)}
                    onReverbCommit={(v) => handleEffectCommit('drums', 'reverb', v)}
                    onDelayChange={(v) => handleEffectChange('drums', 'delay', v)}
                    onDelayCommit={(v) => handleEffectCommit('drums', 'delay', v)}
                />
            </div>
        </div>
    );
}

export function AutopilotMixerControls({ initialVolumes, onVolumeChange, initialEffects, onEffectChange }: MixerControlsProps) {
    const [volumes, setVolumes] = useState(initialVolumes);
    const [effects, setEffects] = useState(initialEffects);

     const handleVolumeChange = useCallback((instrument: keyof Volumes, value: number) => {
        setVolumes(prev => ({ ...prev, [instrument]: value }));
    }, []);
    
    const handleVolumeCommit = useCallback((instrument: keyof Volumes, value: number) => {
        const newVolumes = { ...volumes, [instrument]: value };
        setVolumes(newVolumes);
        onVolumeChange(newVolumes);
    }, [volumes, onVolumeChange]);

    const handleEffectChange = useCallback((instrument: keyof Effects, effect: 'reverb' | 'delay', value: number) => {
        setEffects(prev => ({ ...prev, [instrument]: { ...prev[instrument], [effect]: value }}));
    }, []);
    
    const handleEffectCommit = useCallback((instrument: keyof Effects, effect: 'reverb' | 'delay', value: number) => {
        const newEffects = { ...effects, [instrument]: { ...effects[instrument], [effect]: value }};
        setEffects(newEffects);
        onEffectChange(newEffects);
    }, [effects, onEffectChange]);

    return (
        <div className="p-1 space-y-4">
            <InstrumentControls 
                label="Autopilot Melody"
                icon={Bot}
                volume={volumes.autopilot}
                reverb={effects.autopilot.reverb}
                delay={effects.autopilot.delay}
                onVolumeChange={(v) => handleVolumeChange('autopilot', v)}
                onVolumeCommit={(v) => handleVolumeCommit('autopilot', v)}
                onReverbChange={(v) => handleEffectChange('autopilot', 'reverb', v)}
                onReverbCommit={(v) => handleEffectCommit('autopilot', 'reverb', v)}
                onDelayChange={(v) => handleEffectChange('autopilot', 'delay', v)}
                onDelayCommit={(v) => handleEffectCommit('autopilot', 'delay', v)}
            />
            <InstrumentControls 
                label="Accompaniment"
                icon={GitCompareArrows}
                volume={volumes.accompaniment}
                reverb={effects.accompaniment.reverb}
                delay={effects.accompaniment.delay}
                onVolumeChange={(v) => handleVolumeChange('accompaniment', v)}
                onVolumeCommit={(v) => handleVolumeCommit('accompaniment', v)}
                onReverbChange={(v) => handleEffectChange('accompaniment', 'reverb', v)}
                onReverbCommit={(v) => handleEffectCommit('accompaniment', 'reverb', v)}
                onDelayChange={(v) => handleEffectChange('accompaniment', 'delay', v)}
                onDelayCommit={(v) => handleEffectCommit('accompaniment', 'delay', v)}
            />
            <InstrumentControls 
                label="Autopilot Bass"
                icon={Guitar}
                volume={volumes.autopilotBass}
                reverb={effects.autopilotBass.reverb}
                delay={effects.autopilotBass.delay}
                onVolumeChange={(v) => handleVolumeChange('autopilotBass', v)}
                onVolumeCommit={(v) => handleVolumeCommit('autopilotBass', v)}
                onReverbChange={(v) => handleEffectChange('autopilotBass', 'reverb', v)}
                onReverbCommit={(v) => handleEffectCommit('autopilotBass', 'reverb', v)}
                onDelayChange={(v) => handleEffectChange('autopilotBass', 'delay', v)}
                onDelayCommit={(v) => handleEffectCommit('autopilotBass', 'delay', v)}
            />
            <InstrumentControls 
                label="Effects"
                icon={Sparkles}
                volume={volumes.effects}
                reverb={effects.effects.reverb}
                delay={effects.effects.delay}
                onVolumeChange={(v) => handleVolumeChange('effects', v)}
                onVolumeCommit={(v) => handleVolumeCommit('effects', v)}
                onReverbChange={(v) => handleEffectChange('effects', 'reverb', v)}
                onReverbCommit={(v) => handleEffectCommit('effects', 'reverb', v)}
                onDelayChange={(v) => handleEffectChange('effects', 'delay', v)}
                onDelayCommit={(v) => handleEffectCommit('effects', 'delay', v)}
            />
        </div>
    )
}
