"use client";

import { signIn } from "next-auth/react";

export function LoginForm({ googleConfigured, inviteToken = "" }: { googleConfigured: boolean; inviteToken?: string }) {
  return (
    <>
      {googleConfigured ? (
        <button className="login-button" type="button" onClick={() => void signIn("google", { callbackUrl: inviteToken ? `/?invite=${inviteToken}` : "/" })}>
          Continue with Google
        </button>
      ) : (
        <p className="login-warning">Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.</p>
      )}
      <p className="login-note">PolicyForge keeps each account&apos;s channels, scripts, sources, and encrypted provider keys isolated.</p>
    </>
  );
}
