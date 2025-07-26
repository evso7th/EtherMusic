
"use client";

import { Button } from "@/components/ui/button";
import { Play, Pause, Mic, StopCircle, Power } from 'lucide-react';
import { cn } from "@/lib/utils";

interface PlaybackControlsProps {
    isPlaying: boolean;
    isRecording: boolean;
    onPlayPause: () => void;
    onRecord: () => void;
    onStop: () => void;
    isReady: boolean;
    isMobile: boolean;
}

export function PlaybackControls({ isPlaying, isRecording, onPlayPause, onRecord, onStop, isReady, isMobile }: PlaybackControlsProps) {
    
    const handleExit = () => {
        if (typeof window !== "undefined") {
            window.close();
        }
    };

    return (
        <div className="flex items-center gap-1 md:gap-2">
             <Button onClick={onStop} size="icon" variant="outline" className="w-10 h-10 rounded-full" aria-label="Stop" disabled={!isReady}>
                <StopCircle className="w-5 h-5 md:w-6 md:h-6" />
            </Button>
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
                 <Mic className="w-5 h-5 md:w-6 md:h-6" />
            </Button>
            {!isMobile && (
                <Button onClick={handleExit} size="icon" variant="outline" className="w-10 h-10 rounded-full" aria-label="Exit App">
                    <Power className="w-5 h-5 md:w-6 md:h-6" />
                </Button>
            )}
        </div>
    );
}
