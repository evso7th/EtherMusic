"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface CookieConsentProps {
  onConsentChange: (consent: boolean) => void;
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

export function CookieConsent({ onConsentChange }: CookieConsentProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleConsent = (consent: boolean) => {
    setCookie("ethermusic_consent", String(consent), 365);
    onConsentChange(consent);
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>We use cookies</CardTitle>
          <CardDescription>
            We use cookies to save your mixer settings for your next visit. By clicking "Accept", you agree to the use of cookies.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => handleConsent(false)}>Decline</Button>
          <Button onClick={() => handleConsent(true)}>Accept</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
