"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum } from 'lucide-react';

interface MixerControlsProps {
    volumes: {
        melody: number;
        bass: number;
        drums: number;
    };
    onVolumeChange: (volumes: { melody: number; bass: number; drums: number; }) => void;
}

const VolumeSlider = ({ label, icon: Icon, value, onChange }: { label: string; icon: React.ElementType, value: number, onChange: (value: number) => void }) => (
    <div className="space-y-3 p-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            <Label className="text-md font-medium">{label}</Label>
        </div>
        <Slider
            min={-48}
            max={6}
            step={1}
            value={[value]}
            onValueChange={(v) => onChange(v[0])}
        />
    </div>
);


export function MixerControls({ volumes, onVolumeChange }: MixerControlsProps) {
    return (
        <div className="p-2 space-y-6">
            <VolumeSlider 
                label="Melody"
                icon={Music}
                value={volumes.melody}
                onChange={(v) => onVolumeChange({ ...volumes, melody: v })}
            />
             <VolumeSlider 
                label="Bass"
                icon={Waves}
                value={volumes.bass}
                onChange={(v) => onVolumeChange({ ...volumes, bass: v })}
            />
             <VolumeSlider 
                label="Drums"
                icon={Drum}
                value={volumes.drums}
                onChange={(v) => onVolumeChange({ ...volumes, drums: v })}
            />
        </div>
    );
}
