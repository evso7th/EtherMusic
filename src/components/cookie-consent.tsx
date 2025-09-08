
"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

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

interface CookieConsentProps {
    onConsentChange: (hasConsent: boolean) => void;
}

export function CookieConsent({ onConsentChange }: CookieConsentProps) {
    const [showConsent, setShowConsent] = useState(false);

    useEffect(() => {
        const consent = getCookie("ethermusic_consent");
        if (consent === null) {
            setShowConsent(true);
        } else {
            // Defer the call to avoid state updates during render
            setTimeout(() => onConsentChange(consent === 'true'), 0);
        }
    }, [onConsentChange]);

    const acceptCookie = () => {
        setShowConsent(false);
        setCookie("ethermusic_consent", "true", 365);
        onConsentChange(true);
    };

    const declineCookie = () => {
        setShowConsent(false);
        setCookie("ethermusic_consent", "false", 365);
        onConsentChange(false);
    };

    if (!showConsent) {
        return null;
    }

    return (
        <div className={cn(
            "fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-center p-4",
            "bg-background/80 backdrop-blur-sm"
        )}>
            <div className="max-w-xl w-full p-4 rounded-lg bg-card border border-border shadow-lg flex flex-col md:flex-row items-center gap-4">
                <p className="text-sm text-card-foreground flex-grow">
                    This site uses a cookie only to remember your mixer presets. We value your privacy and do not save or transmit any other data. If you decline, settings will reset on each visit.
                </p>
                <div className="flex-shrink-0 flex gap-2">
                    <Button variant="outline" onClick={declineCookie}>No</Button>
                    <Button onClick={acceptCookie}>Yes</Button>
                </div>
            </div>
        </div>
    );
}

    