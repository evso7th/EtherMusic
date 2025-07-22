"use client";

import { Button } from "@/components/ui/button";
import { Play, Pause, Mic, StopCircle, Square } from 'lucide-react';

interface PlaybackControlsProps {
    isPlaying: boolean;
    isRecording: boolean;
    onPlayPause: () => void;
    onRecord: () => void;
    onStop: () => void;
}

export function PlaybackControls({ isPlaying, isRecording, onPlayPause, onRecord, onStop }: PlaybackControlsProps) {
    return (
        <div className="flex items-center gap-2">
            <Button onClick={onPlayPause} size="icon" className="w-12 h-12 rounded-full" aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
            </Button>
            <Button onClick={onStop} size="icon" variant="outline" className="w-12 h-12 rounded-full" aria-label="Stop">
                <Square className="w-6 h-6" />
            </Button>
            <Button onClick={onRecord} variant="outline" size="icon" className={`w-12 h-12 rounded-full transition-colors ${isRecording ? 'bg-red-500/80 text-white border-red-500 hover:bg-red-600' : ''}`} aria-label={isRecording ? "Stop Recording" : "Record"}>
                {isRecording ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>
        </div>
    );
}
