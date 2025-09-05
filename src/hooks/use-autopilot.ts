
"use client";
import { useState, useEffect, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { AutopilotStyle, AutopilotPart, Instrument, MusicKey, MusicScale, Tempo } from '@/types';

const AUTOPILOT_PRESETS_COOKIE = 'ethermusic_autopilot_presets';

type AutopilotPreset = {
    instruments: Record<AutopilotPart, Instrument>;
    volumes: Record<string, number>; // Assuming a flexible volume structure for now
    key: MusicKey;
    scale: MusicScale;
    tempo: Tempo;
};

type AllPresets = {
    [key in AutopilotStyle['name']]?: AutopilotPreset;
};

// Helper functions for cookies
function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

function setCookie(name: string, value: string, days: number) {
    if (typeof document === 'undefined') return;
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}


export function useAutopilot(
    initialStyle: AutopilotStyle,
    isCookieAllowed: boolean
) {
    const { toast } = useToast();
    const [activeStyle, setActiveStyle] = useState<AutopilotStyle>(initialStyle);
    const [presets, setPresets] = useState<AllPresets>({});

    // Load presets from cookies on initial render
    useEffect(() => {
        if (isCookieAllowed) {
            try {
                const savedPresets = getCookie(AUTOPILOT_PRESETS_COOKIE);
                if (savedPresets) {
                    setPresets(JSON.parse(savedPresets));
                }
            } catch (e) {
                console.error("Failed to load autopilot presets:", e);
            }
        }
    }, [isCookieAllowed]);

    const savePreset = useCallback((preset: AutopilotPreset) => {
        if (!isCookieAllowed) {
            toast({
                title: "Cookies Disabled",
                description: "Please enable cookies to save presets.",
                variant: "destructive",
            });
            return;
        }
        const newPresets = { ...presets, [activeStyle.name]: preset };
        setPresets(newPresets);
        setCookie(AUTOPILOT_PRESETS_COOKIE, JSON.stringify(newPresets), 365);
        toast({
            title: "Preset Saved",
            description: `Settings for "${activeStyle.name}" have been saved.`,
        });
    }, [presets, activeStyle.name, isCookieAllowed, toast]);

    const loadPreset = useCallback((styleName: AutopilotStyle['name']): AutopilotPreset | null => {
        if (!isCookieAllowed) {
            toast({
                title: "Cookies Disabled",
                description: "Cannot load presets without cookie consent.",
                variant: "destructive",
            });
            return null;
        }
        const preset = presets[styleName];
        if (preset) {
            toast({
                title: "Preset Loaded",
                description: `Settings for "${styleName}" have been applied.`,
            });
            return preset;
        } else {
             toast({
                title: "No Preset Found",
                description: `No saved settings for "${styleName}".`,
                variant: "destructive",
            });
            return null;
        }
    }, [presets, isCookieAllowed, toast]);
    
    const handleStyleChange = (styleName: AutopilotStyle['name']) => {
        // This function would be expanded to maybe auto-load a preset
        // For now, it just updates the active style conceptually
        // The actual logic change is handled in the worker
    };


    return {
        activeStyle,
        setActiveStyle,
        savePreset,
        loadPreset,
        handleStyleChange
    };
}

    