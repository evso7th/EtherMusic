
"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Bot, Save, FolderDown, SlidersHorizontal, Music, BrainCircuit } from 'lucide-react';
import { useState, useMemo, useCallback, memo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "./ui/switch";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { AutopilotSettings, Instrument, BassInstrument, Volumes, AutopilotStyle, AutopilotPreset } from '@/types';
import { melodyInstruments } from "@/lib/melody-presets";
import { bassInstruments } from "@/lib/bass-presets";
import { MixerControls } from './mixer-controls';

const AUTOPILOT_STYLES: AutopilotStyle[] = ['Ambient', 'Sequence', 'Water', 'Air', 'Toccata', 'Promenade', 'Space'];

interface AutopilotControlsProps {
    isMobile: boolean;
    isLandscape?: boolean;
    onSettingsChange: (settings: Partial<AutopilotSettings>) => void;
    initialSettings: AutopilotSettings;
    volumes: Volumes;
    onMixerChange: (volumes: Partial<Volumes>) => void;
    onAutopilotPresetLoad: (preset: AutopilotPreset) => void;
}

const ControlButtonWithTooltip = memo(function ControlButtonWithTooltip({ tooltipText, children, ...props }: React.ComponentProps<typeof Button> & { tooltipText: string, children: React.ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button {...props}>{children}</Button>
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltipText}</p>
            </TooltipContent>
        </Tooltip>
    );
});

export function AutopilotControls({
    isMobile,
    isLandscape = false,
    onSettingsChange,
    initialSettings,
    volumes,
    onMixerChange,
    onAutopilotPresetLoad,
}: AutopilotControlsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [settings, setSettings] = useState<AutopilotSettings>(initialSettings);
    const { toast } = useToast();

    useEffect(() => {
        setSettings(initialSettings);
    }, [initialSettings]);
    
    // This effect ensures that when the global autopilot settings are updated
    // (e.g., by loading a preset), the local state of this component reflects that change.
    useEffect(() => {
        setSettings(prevSettings => {
            // Only update if there's an actual change to avoid loops
            if (JSON.stringify(prevSettings) !== JSON.stringify(initialSettings)) {
                return initialSettings;
            }
            return prevSettings;
        });
    }, [initialSettings]);

    // This is for local slider updates to feel responsive
    const handleLocalSettingsChange = (newSettings: Partial<AutopilotSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    // This is for committing the changes to the parent state
    const handleGlobalSettingsChange = (newSettings: Partial<AutopilotSettings>) => {
        onSettingsChange(newSettings);
    };
    
    const handleSavePreset = useCallback(() => {
        if (typeof window === 'undefined') return;
        const currentStyle = settings.style;
        const preset: AutopilotPreset = {
            instruments: settings.instruments,
            volumes: {
                melody: volumes.melody,
                latch: volumes.latch,
                manualBass: volumes.manualBass,
                drums: volumes.drums,
                reverbReturn: volumes.reverbReturn,
                compressor: volumes.compressor,
                autopilotAccompaniment: volumes.autopilotAccompaniment,
                autopilotBass: volumes.autopilotBass,
                autopilotMelody: volumes.autopilotMelody,
            }
        };

        try {
            const presetKey = `ethermusic_autopilot_${currentStyle}`;
            const consent = document.cookie.includes('ethermusic_consent=true');
            if (!consent) {
                toast({
                    title: "Cookie Consent Required",
                    description: "Please accept cookies to save presets.",
                    variant: "destructive",
                });
                return;
            }
            localStorage.setItem(presetKey, JSON.stringify(preset));
            toast({
                title: "Preset Saved",
                description: `Your settings for the "${currentStyle}" style have been saved.`,
            });
        } catch (e) {
            console.error("Failed to save preset:", e);
            toast({
                title: "Error Saving Preset",
                description: "Could not save settings. Your browser might be out of space.",
                variant: "destructive"
            });
        }
    }, [settings.instruments, settings.style, volumes, toast]);

    const handleLoadPreset = useCallback(() => {
        if (typeof window === 'undefined') return;
        const currentStyle = settings.style;
        try {
            const presetKey = `ethermusic_autopilot_${currentStyle}`;
            const savedPresetString = localStorage.getItem(presetKey);

            if (savedPresetString) {
                const preset: AutopilotPreset = JSON.parse(savedPresetString);
                onAutopilotPresetLoad(preset); // Use the callback
                toast({
                    title: "Preset Loaded",
                    description: `Settings for the "${currentStyle}" style have been restored.`,
                });
            } else {
                toast({
                    title: "No Preset Found",
                    description: `You haven't saved a preset for the "${currentStyle}" style yet.`,
                    variant: "destructive"
                });
            }
        } catch (e) {
             console.error("Failed to load preset:", e);
            toast({
                title: "Error Loading Preset",
                description: "Could not load settings.",
                variant: "destructive"
            });
        }
    }, [settings.style, onAutopilotPresetLoad, toast]);

    const renderContent = () => (
        <ScrollArea className="h-auto max-h-[70vh]">
            <div className="pr-4 py-4 space-y-6">
                <div className="flex items-center justify-between">
                    <Label htmlFor="autopilot-switch" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                        <Bot className="w-5 h-5"/>
                        Autopilot
                    </Label>
                    <Switch
                        id="autopilot-switch"
                        checked={settings.enabled}
                        onCheckedChange={(enabled) => handleGlobalSettingsChange({ enabled })}
                    />
                </div>

                <div className={cn("space-y-6 transition-opacity", !settings.enabled && "opacity-50 pointer-events-none")}>
                    <Separator />
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                             <BrainCircuit className="w-5 h-5 text-primary" />
                             Style
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {AUTOPILOT_STYLES.map((style) => (
                                <Button
                                    key={style}
                                    variant={settings.style === style ? 'default' : 'outline'}
                                    onClick={() => handleGlobalSettingsChange({ style })}
                                    size="sm"
                                >
                                    {style}
                                </Button>
                            ))}
                        </div>
                    </div>
                   
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                            <SlidersHorizontal className="w-5 h-5 text-primary" />
                            Parameters
                        </h3>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="density-slider" className="text-sm font-medium">Density</Label>
                                <span className="text-xs text-muted-foreground">{Math.round(settings.density * 100)}%</span>
                            </div>
                            <Slider
                                id="density-slider"
                                min={0}
                                max={1}
                                step={0.01}
                                value={[settings.density]}
                                onValueChange={([val]) => handleLocalSettingsChange({ density: val })}
                                onValueCommit={([val]) => handleGlobalSettingsChange({ density: val })}
                            />
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                         <h3 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                            <Music className="w-5 h-5 text-primary" />
                            Instruments
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Melody</Label>
                                <Select 
                                    value={settings.instruments.melody} 
                                    onValueChange={(v: Instrument) => handleGlobalSettingsChange({ instruments: { ...settings.instruments, melody: v } })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Melody Instrument" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {melodyInstruments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Accompaniment</Label>
                                <Select 
                                    value={settings.instruments.accompaniment} 
                                    onValueChange={(v: Instrument) => handleGlobalSettingsChange({ instruments: { ...settings.instruments, accompaniment: v } })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Accompaniment Instrument" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {melodyInstruments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Bass</Label>
                                <Select 
                                    value={settings.instruments.bass} 
                                    onValueChange={(v: BassInstrument) => handleGlobalSettingsChange({ instruments: { ...settings.instruments, bass: v } })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Bass Instrument" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {bassInstruments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    
                    <Separator />

                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">Presets for "{settings.style}"</h3>
                        <div className="flex gap-2">
                            <Button variant="outline" className="w-full" onClick={handleSavePreset}>
                                <Save className="mr-2 h-4 w-4" /> Save Current
                            </Button>
                            <Button variant="outline" className="w-full" onClick={handleLoadPreset}>
                                <FolderDown className="mr-2 h-4 w-4" /> Load
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground pt-2">Presets save the current Autopilot instruments and all Mixer settings. Saved in your browser.</p>
                    </div>

                    <Separator />
                     <div className="space-y-4">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">Autopilot Mixer</h3>
                        <MixerControls 
                            volumes={volumes} 
                            onMixerChange={onMixerChange} 
                            onCompressorChange={() => {}} // Pass a dummy function, as master compressor is handled outside
                            tempo={0} // Tempo is not controlled here
                            setTempo={() => {}} // Pass a dummy function
                            isAutopilotMixer={true}
                        />
                    </div>
                </div>
            </div>
        </ScrollArea>
    );

    const buttonSize = isMobile ? 'sm' : 'default';
    const ControlButton = isMobile ? Button : ControlButtonWithTooltip;

    return (
        <TooltipProvider>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                     <ControlButton
                        tooltipText="Autopilot"
                        variant={settings.enabled ? 'default' : 'outline'}
                        className={cn(isLandscape ? "w-10 h-10 rounded-full" : "flex-1", settings.enabled && 'animate-pulse')}
                        size={isLandscape ? "icon" : buttonSize}
                        aria-label="Autopilot Settings"
                    >
                        <Bot className="w-4 h-4 md:w-5 md:h-5 md:mr-2" />
                        {!isLandscape && <span className="hidden sm:inline">Autopilot</span>}
                    </ControlButton>
                </DialogTrigger>
                <DialogContent>
                     <DialogHeader>
                        <DialogTitle>Autopilot Settings</DialogTitle>
                        <DialogDescription>
                             Configure the automatic music generation. Changes are applied immediately.
                        </DialogDescription>
                    </DialogHeader>
                    {renderContent()}
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
