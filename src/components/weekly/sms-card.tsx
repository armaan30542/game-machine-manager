"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Recipient {
  name: string;
  phone: string;
}

interface SmsSettings {
  recipients: Recipient[];
  missing_settings: string[];
}

/** "+14045551234" -> "(404) 555-1234"; other countries are shown as stored. */
const pretty = (phone: string) => {
  const m = phone.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
};

/**
 * Admin card: who gets the Monday revenue text, sent through Twilio.
 * The list is only ever loaded for admins.
 */
export function SmsCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sms-recipients"],
    queryFn: async (): Promise<SmsSettings> => {
      const res = await fetch("/api/sms/recipients");
      if (!res.ok) throw new Error("Could not load the list");
      return res.json();
    },
  });

  async function save(recipients: Recipient[], done: string) {
    const res = await fetch("/api/sms/recipients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "The list could not be saved");
      return false;
    }
    toast.success(done);
    queryClient.invalidateQueries({ queryKey: ["sms-recipients"] });
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !phone.trim()) return;
    setBusy("add");
    const ok = await save(
      [...data.recipients, { name: name.trim(), phone: phone.trim() }],
      "Added to the Monday text."
    );
    if (ok) {
      setName("");
      setPhone("");
    }
    setBusy(null);
  }

  async function remove(target: Recipient) {
    if (!data) return;
    setBusy(target.phone);
    await save(
      data.recipients.filter((r) => r.phone !== target.phone),
      "Removed from the Monday text."
    );
    setBusy(null);
  }

  async function test(target: Recipient) {
    setBusy(target.phone);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: target.phone }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) toast.success(`Test text sent to ${pretty(target.phone)}.`);
      else toast.error(body.error || "The test text was not sent");
    } catch {
      toast.error("The test text was not sent");
    } finally {
      setBusy(null);
    }
  }

  const missing = data?.missing_settings ?? [];
  const ready = !!data && missing.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4" />
          Monday text message
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading || !data ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            {ready ? (
              <p className="text-muted-foreground">
                Every Monday at 11:30 AM Eastern, last week&apos;s revenue by
                state is texted to the numbers below through your Twilio
                account.
              </p>
            ) : (
              <p className="rounded-md bg-orange-50 p-3 text-orange-800">
                Texts are not being sent yet. Add{" "}
                {missing.map((m, i) => (
                  <span key={m}>
                    <code className="font-mono">{m}</code>
                    {i < missing.length - 1 ? ", " : ""}
                  </span>
                ))}{" "}
                in the Vercel project&apos;s Environment Variables, then
                redeploy. You can build the list below in the meantime.
              </p>
            )}

            {data.recipients.length === 0 ? (
              <p className="text-muted-foreground">No one is on the list yet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {data.recipients.map((r) => (
                  <li
                    key={r.phone}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span>
                      <span className="font-medium">{r.name || "No name"}</span>{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {pretty(r.phone)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => test(r)}
                        disabled={!ready || busy !== null}
                      >
                        Send a test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remove(r)}
                        disabled={busy !== null}
                        aria-label={`Remove ${r.name || pretty(r.phone)}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Name"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sm:w-[180px]"
                maxLength={60}
              />
              <Input
                aria-label="Mobile number"
                placeholder="Mobile number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="sm:w-[200px]"
                required
              />
              <Button type="submit" disabled={busy !== null || !phone.trim()}>
                Add
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Only add people who have agreed to get this text. US numbers can
              be typed as 10 digits.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
