import Link from "next/link";
import { apiPath } from "@/lib/client-api";

export function LoginForm({ googleConfigured, inviteToken = "" }: { googleConfigured: boolean; inviteToken?: string }) {
  return (
    <>
      {googleConfigured ? (
        <Link className="login-button" href={`${apiPath("/api/auth/signin/google")}?callbackUrl=${encodeURIComponent(inviteToken ? `/?invite=${inviteToken}` : "/")}`}>
          Continue with Google
        </Link>
      ) : (
        <p className="login-warning">Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.</p>
      )}
      <p className="login-note">PolicyForge keeps each account&apos;s channels, scripts, sources, and encrypted provider keys isolated.</p>
    </>
  );
}
