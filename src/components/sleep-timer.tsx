
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Timer, TimerOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";


interface SleepTimerProps {
  onTimerSet: (durationMinutes: number | null) => void;
}

const TIMER_OPTIONS = [5, 10, 15, 30, 45, 60]; // in minutes

export function SleepTimer({ onTimerSet }: SleepTimerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [activeTimer, setActiveTimer] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
   const isMobile = useIsMobile();


  useEffect(() => {
    if (activeTimer) {
      setTimeLeft(activeTimer);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setActiveTimer(null);
            onTimerSet(null); // Signal that timer is done
            toast({ title: "Sleep Timer Finished" });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeTimer, onTimerSet, toast]);

  const handleSetTimer = () => {
    if (selectedDuration) {
      setActiveTimer(selectedDuration * 60);
      onTimerSet(selectedDuration);
      toast({
        title: "Sleep Timer Set",
        description: `Music will fade out in ${selectedDuration} minutes.`,
      });
    }
    setIsOpen(false);
  };
  
  const handleCancelTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setActiveTimer(null);
    setTimeLeft(0);
    setSelectedDuration(null);
    onTimerSet(null);
    toast({ title: "Sleep Timer Canceled" });
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
   const ControlButtonWrapper = ({ tooltipText, children }: { tooltipText: string, children: React.ReactNode }) => {
        if (isMobile) return <>{children}</>;
        return (
             <Tooltip>
                <TooltipTrigger asChild>
                    {children}
                </TooltipTrigger>
                <TooltipContent>
                    <p>{tooltipText}</p>
                </TooltipContent>
            </Tooltip>
        );
    };


  if(activeTimer) {
    return (
         <TooltipProvider>
            <ControlButtonWrapper tooltipText={`Cancel Timer (${formatTime(timeLeft)})`}>
                <Button 
                    onClick={handleCancelTimer}
                    size="icon" 
                    variant="outline" 
                    className="w-10 h-10 rounded-full text-accent animate-pulse"
                    aria-label="Cancel Sleep Timer"
                >
                    <TimerOff className="w-5 h-5" />
                </Button>
            </ControlButtonWrapper>
        </TooltipProvider>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <ControlButtonWrapper tooltipText="Sleep Timer">
            <DialogTrigger asChild>
                <Button size="icon" variant="outline" className="w-10 h-10 rounded-full" aria-label="Set Sleep Timer">
                    <Timer className="w-5 h-5" />
                </Button>
            </DialogTrigger>
        </ControlButtonWrapper>
      </TooltipProvider>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sleep Timer</DialogTitle>
          <DialogDescription>
            The music will fade out and stop after the selected duration.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          defaultValue={selectedDuration?.toString()}
          onValueChange={(value) => setSelectedDuration(Number(value))}
          className="grid grid-cols-3 gap-4 py-4"
        >
          {TIMER_OPTIONS.map(duration => (
            <Label
              key={duration}
              htmlFor={`timer-${duration}`}
              className={cn(
                  "flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground",
                  selectedDuration === duration && "border-primary"
              )}
            >
              <RadioGroupItem value={duration.toString()} id={`timer-${duration}`} className="sr-only" />
              <span>{duration} min</span>
            </Label>
          ))}
        </RadioGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSetTimer} disabled={!selectedDuration}>Set Timer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

