
"use client";

import { Button } from "@/components/ui/button";
import { Play, Pause, Mic, StopCircle, Power, Bot } from 'lucide-react';
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface PlaybackControlsProps {
    isPlaying: boolean;
    isRecording: boolean;
    isAutopilotOn: boolean;
    onPlayPause: () => void;
    onRecord: () => void;
    onStop: () => void;
    onAutopilotToggle: () => void;
    isReady: boolean;
}

export function PlaybackControls({ 
    isPlaying, 
    isRecording, 
    isAutopilotOn,
    onPlayPause, 
    onRecord, 
    onStop,
    onAutopilotToggle,
    isReady 
}: PlaybackControlsProps) {
    
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
                onClick={onAutopilotToggle} 
                variant={isAutopilotOn ? 'default' : 'outline'} 
                size="icon" 
                className={cn(
                    'w-10 h-10 rounded-full transition-colors',
                    isAutopilotOn && 'animate-pulse-primary'
                )}
                aria-label={isAutopilotOn ? "Stop Autopilot" : "Start Autopilot"} 
                disabled={!isReady}
            >
                 <Bot className="w-5 h-5 md:w-6 md:h-6" />
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
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button size="icon" variant="outline" className="w-10 h-10 rounded-full" aria-label="Exit App">
                        <Power className="w-5 h-5 md:w-6 md:h-6" />
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>End Meditation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to break your meditation and leave the app?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>No</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleExit}
                            className="bg-transparent border border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                        >
                            Yes
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
