
"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";
import { guideContent } from "./help-guide-content";


interface HelpGuideProps extends ButtonProps {
    buttonClassName?: string;
    showText?: boolean;
}

export const HelpGuide = ({ buttonVariant = "outline", buttonClassName, showText = true, size, ...props }: HelpGuideProps) => {
    
    // The content is now pre-rendered or will be handled differently.
    // For now, we'll just display it raw to show the structure.
    // In a real scenario, we would use a library that processes markdown at build time.
    const content = (
        <div 
            className="prose prose-invert p-4" 
            dangerouslySetInnerHTML={{ __html: guideContent.replace(/\n/g, '<br />') }} // Simple conversion for display
        />
    );

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={buttonVariant} size={size || (showText ? "default" : "icon")} className={cn(buttonClassName)} {...props}>
                    <HelpCircle className="w-5 h-5" />
                    <span className={cn(
                        "sr-only",
                        showText && "sm:not-sr-only sm:ml-2 sm:inline"
                    )}>
                        Help
                    </span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] md:max-w-xl lg:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Quick Guide</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[70vh] w-full">
                    {content}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
