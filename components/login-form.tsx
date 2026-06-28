"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { apiPath } from "@/lib/client-api";

type Mode = "signin" | "signup";

export function LoginForm({ googleConfigured, inviteToken = "" }: { googleConfigured: boolean; inviteToken?: string }) {
  const [mode, setMode] = useState<Mode>(inviteToken ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const response = await fetch(apiPath("/api/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, inviteToken: inviteToken || undefined })
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not create account.");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false
      });
      if (result?.error) throw new Error("Invalid email/password or this account is disabled.");
      if (inviteToken && mode === "signin") {
        const inviteResponse = await fetch(apiPath("/api/workspaces/invites/accept"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: inviteToken })
        });
        const invitePayload = (await inviteResponse.json()) as { error?: string };
        if (!inviteResponse.ok) throw new Error(invitePayload.error || "Could not accept the workspace invite.");
      }
      window.location.href = "/";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="auth-toggle">
        <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => setMode("signin")}>
          Sign in
        </button>
        <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
          Create account
        </button>
      </div>

      <form className="auth-form" onSubmit={submit}>
        {inviteToken ? <p className="login-note">Invite detected. Sign in or create an account with the invited email to join the workspace.</p> : null}
        {mode === "signup" ? (
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
          </label>
        ) : null}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>
        <button className="login-button" type="submit" disabled={loading}>
          {loading ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <Link className="login-help-link" href="/reset-password">
        Have a reset link?
      </Link>

      {googleConfigured ? (
        <Link className="secondary-login" href={apiPath("/api/auth/signin/google")}>
          Continue with Google
        </Link>
      ) : null}

      {message ? <p className="login-warning">{message}</p> : null}
    </>
  );
}
