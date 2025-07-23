
"use client";

import { Button } from "@/components/ui/button";
import { Play, Pause, Mic, StopCircle, Square } from 'lucide-react';

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
            <Button onClick={onPlayPause} size="icon" className="w-10 h-10 md:w-12 md:h-12 rounded-full" aria-label={isPlaying ? "Pause" : "Play"} disabled={!isReady}>
                {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-5 h-5 md:w-6 md:h-6 ml-1" />}
            </Button>
            <Button onClick={onStop} size="icon" variant="outline" className="w-10 h-10 md:w-12 md:h-12 rounded-full" aria-label="Stop" disabled={!isReady}>
                <Square className="w-5 h-5 md:w-6 md:h-6" />
            </Button>
            <Button onClick={onRecord} variant="outline" size="icon" className={`w-10 h-10 md:w-12 md:h-12 rounded-full transition-colors ${isRecording ? 'bg-red-500/80 text-white border-red-500 hover:bg-red-600' : ''}`} aria-label={isRecording ? "Stop Recording" : "Record"} disabled={!isReady}>
                {isRecording ? <StopCircle className="w-5 h-5 md:w-6 md:h-6" /> : <Mic className="w-5 h-5 md:w-6 md:h-6" />}
            </Button>
        </div>
    );
}

    