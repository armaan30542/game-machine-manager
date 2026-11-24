"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status =
  | "checking"
  | "unsupported"
  | "needs-install"
  | "blocked"
  | "off"
  | "on";

/** The server's public key, in the binary form the browser wants. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Turns the Monday notification on or off for the device being used.
 * Each phone or computer is switched on separately, by the person using it.
 */
export function NotificationCard() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        // iPhones and iPads only allow this once the site is on the home screen.
        const apple =
          /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
        if (!cancelled) setStatus(apple ? "needs-install" : "unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        if (Notification.permission === "denied") setStatus("blocked");
        else setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const configRes = await fetch("/api/push/config");
      const config = await configRes.json();
      if (!configRes.ok || !config.publicKey) {
        toast.error(config.error || "Notifications are not set up yet");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(config.publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) {
        await subscription.unsubscribe();
        toast.error("This device could not be saved. Try again.");
        return;
      }
      setStatus("on");
      toast.success("Notifications are on for this device.");
    } catch {
      toast.error("Notifications could not be turned on for this device.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
      toast.success("Notifications are off for this device.");
    } catch {
      toast.error("Notifications could not be turned off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json();
      if (!res.ok) toast.error(body.error || "The test could not be sent");
      else if (body.sent > 0) toast.success("Test sent. It should arrive in a few seconds.");
      else toast.error("No device of yours is signed up. Turn notifications on first.");
    } catch {
      toast.error("The test could not be sent");
    } finally {
      setBusy(false);
    }
  }

  const Icon = status === "on" ? BellRing : status === "off" ? Bell : BellOff;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          Monday notification on this device
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status === "checking" && (
          <p className="text-muted-foreground">Checking this device…</p>
        )}
        {status === "on" && (
          <>
            <p>
              On. Every Monday morning this device gets last week&apos;s
              revenue by state, compared with the week before.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={sendTest} disabled={busy}>
                Send a test
              </Button>
              <Button variant="outline" onClick={turnOff} disabled={busy}>
                Turn off
              </Button>
            </div>
          </>
        )}
        {status === "off" && (
          <>
            <p className="text-muted-foreground">
              Off. Turn it on to get last week&apos;s revenue by state every
              Monday morning. Each phone or computer is turned on separately.
            </p>
            <Button onClick={turnOn} disabled={busy}>
              {busy ? "Turning on…" : "Turn on notifications"}
            </Button>
          </>
        )}
        {status === "blocked" && (
          <p className="text-muted-foreground">
            Notifications are blocked for this site in the browser&apos;s
            settings. Allow them there (the lock icon next to the address),
            then reload this page.
          </p>
        )}
        {status === "needs-install" && (
          <p className="text-muted-foreground">
            On an iPhone or iPad, first add this site to the home screen: tap
            the Share button, then &quot;Add to Home Screen&quot;. Open it from
            the new icon, come back to this page, and the switch will appear.
          </p>
        )}
        {status === "unsupported" && (
          <p className="text-muted-foreground">
            This browser can&apos;t receive notifications from the site. Use
            Chrome, Edge, Firefox or Safari on a recent phone or computer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
