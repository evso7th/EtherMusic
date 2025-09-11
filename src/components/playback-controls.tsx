
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Circle, Power, Play, Pause } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

interface PlaybackControlsProps {
    isPlaying: boolean;
    isRecording: boolean;
    onPlayPause: () => void;
    onRecord: () => void;
    onExit: () => void;
    isReady: boolean;
}

const ControlButton = ({ tooltipText, children, isMobile, ...props }: { tooltipText: string, children: React.ReactNode, isMobile: boolean } & React.ComponentProps<typeof Button>) => {
    if (isMobile) {
        return <Button {...props}>{children}</Button>;
    }
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
};


export function PlaybackControls({ 
    isPlaying,
    isRecording, 
    onPlayPause,
    onRecord, 
    onExit,
    isReady 
}: PlaybackControlsProps) {
    const isMobile = useIsMobile();
    
    const handleExit = () => {
        onExit();
        if (typeof window !== "undefined") {
            try {
                // This will close the window if it was opened by a script.
                window.close();
                // As a fallback for browser tabs that can't be closed by script:
                window.location.href = "about:blank";
            } catch (e) {
                console.error("Could not close window:", e)
            }
        }
    };
    
    return (
        <TooltipProvider>
             <ControlButton
                tooltipText={isPlaying ? "Pause" : "Play"}
                onClick={onPlayPause}
                variant="outline"
                size="icon" 
                className="w-10 h-10 rounded-full"
                aria-label={isPlaying ? "Pause" : "Play"}
                disabled={!isReady}
                isMobile={isMobile}
            >
                {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-5 h-5 md:w-6 md:h-6" />}
            </ControlButton>

            <ControlButton
                tooltipText="Record"
                onClick={onRecord} 
                variant={isRecording ? 'destructive' : 'outline'} 
                size="icon" 
                className={cn(
                    'w-10 h-10 rounded-full transition-colors',
                    isRecording && 'animate-pulse'
                )}
                aria-label={isRecording ? "Stop Recording" : "Record"} 
                disabled={!isReady}
                isMobile={isMobile}
            >
                 <Circle className="w-5 h-5 md:w-6 md:h-6" />
            </ControlButton>
            <AlertDialog>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                            <Button size="icon" variant="outline" className="w-10 h-10 rounded-full" aria-label="Exit App">
                                <Power className="w-5 h-5 md:w-6 md:h-6" />
                            </Button>
                        </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Exit</p>
                    </TooltipContent>
                </Tooltip>
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
        </TooltipProvider>
    );
}
