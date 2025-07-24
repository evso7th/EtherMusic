
"use client";

import { Button } from "@/components/ui/button";
import { Play, Pause, Mic, StopCircle } from 'lucide-react';
import { cn } from "@/lib/utils";

interface PlaybackControlsProps {
    isPlaying: boolean;
    isRecording: boolean;
    onPlayPause: () => void;
    onRecord: () => void;
    onStop: () => void;
    isReady: boolean;
}

export function PlaybackControls({ isPlaying, isRecording, onPlayPause, onRecord, onStop, isReady }: PlaybackControlsProps) {
    return (
        <div className="flex items-center gap-1 md:gap-2">
            <Button onClick={onPlayPause} size="icon" className="w-10 h-10 rounded-full" aria-label={isPlaying ? "Pause" : "Play"} disabled={!isReady}>
                {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-5 h-5 md:w-6 md:h-6 ml-1" />}
            </Button>
            <Button 
                onClick={onRecord} 
                variant={isRecording ? 'default' : 'outline'} 
                size="icon" 
                className={cn(
                    'w-10 h-10 rounded-full transition-colors',
                    isRecording && 'animate-pulse-primary'
                )}
                aria-label={isRecording ? "Stop Recording" : "Record"} 
                disabled={!isReady}
            >
                {isRecording ? <StopCircle className="w-5 h-5 md:w-6 md:h-6" /> : <Mic className="w-5 h-5 md:w-6 md:h-6" />}
            </Button>
        </div>
    );
}
