import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function AdminSignIn({
  authBasePath,
  callbackURL,
}: {
  authBasePath: string;
  callbackURL: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${authBasePath}/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL,
          disableRedirect: true,
        }),
      });
      const body = await response.text();
      let data: {
        url?: string;
        message?: string;
        error?: { message?: string };
      } = {};
      if (body) {
        try {
          data = JSON.parse(body);
        } catch {
          throw new Error(
            `Google sign-in returned an invalid response (${response.status}).`,
          );
        }
      }
      if (!response.ok || !data.url) {
        throw new Error(
          data.error?.message ||
            data.message ||
            `Google sign-in could not be started (${response.status}).`,
        );
      }
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
      setBusy(false);
    }
  };
  return (
    <div>
      <Button size="lg" type="button" onClick={signIn} disabled={busy}>
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error && <p className="text-destructive" role="alert">{error}</p>}
    </div>
  );
}
