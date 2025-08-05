
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
import { marked } from 'marked';
import { useMemo } from 'react';


interface HelpGuideProps extends ButtonProps {
    buttonClassName?: string;
    showText?: boolean;
}

export const HelpGuide = ({ buttonVariant = "outline", buttonClassName, showText = true, size, ...props }: HelpGuideProps) => {
    
    const content = useMemo(() => {
        // Parse the markdown content into an HTML string ONCE.
        const htmlContent = marked.parse(guideContent);
        return (
            <div 
                className="prose prose-invert p-4" 
                dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
        );
    }, []); // Empty dependency array ensures this runs only once.


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
