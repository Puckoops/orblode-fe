"use client";

import { GoogleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@puckoops/camelot";
import { useEffect, useRef, useState } from "react";

interface CodeClient {
  requestCode(): void;
}

interface GoogleOAuth2 {
  initCodeClient(config: {
    client_id: string;
    scope: string;
    ux_mode: "popup";
    select_account: boolean;
    callback: (response: { code?: string; error?: string }) => void;
    error_callback: (error: { type: string }) => void;
  }): CodeClient;
}

type GoogleWindow = Window & { google?: { accounts?: { oauth2?: GoogleOAuth2 } } };

let loading: Promise<GoogleOAuth2> | null = null;

function loadGoogleOAuth2(): Promise<GoogleOAuth2> {
  const ready = () => (window as GoogleWindow).google?.accounts?.oauth2;
  const loaded = ready();
  if (loaded) return Promise.resolve(loaded);
  loading ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      const oauth2 = ready();
      if (oauth2) resolve(oauth2);
      else reject(new Error("Google's sign-in script loaded without google.accounts.oauth2"));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Google's sign-in script did not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

interface GoogleButtonProps {
  clientId: string;
  /** Receives the one-time code from Google's popup, for POST /api/auth/google. */
  onCode: (code: string) => void;
  /** Called when the popup could not open. Closing it or declining is not an error. */
  onError: (message: string) => void;
  disabled?: boolean;
  label?: string;
}

/** "Sign in with Google" drawn by camelot. Hidden when Google's script cannot load, as when a blocker stops it. */
export function GoogleButton({ clientId, onCode, onError, disabled, label = "Sign in with Google" }: GoogleButtonProps) {
  const client = useRef<CodeClient | null>(null);
  const handlers = useRef({ onCode, onError });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    handlers.current = { onCode, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadGoogleOAuth2().then(
      (oauth2) => {
        if (cancelled) return;
        client.current = oauth2.initCodeClient({
          client_id: clientId,
          scope: "openid email profile",
          ux_mode: "popup",
          select_account: true,
          callback: (response) => {
            if (response.code) handlers.current.onCode(response.code);
          },
          error_callback: (error) => {
            if (error.type === "popup_failed_to_open") handlers.current.onError("Allow pop-ups for this site to sign in with Google.");
          },
        });
        setReady(true);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (failed) return null;
  return (
    <Button type="button" variant="ghost" size="lg" iconStart={GoogleIcon} disabled={!ready || disabled} onClick={() => client.current?.requestCode()}>
      {label}
    </Button>
  );
}
