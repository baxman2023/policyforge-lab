import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <main className="login-page">
      <section className="login-panel reset-panel">
        <div className="brand-mark" aria-label="PolicyForge LAB" />
        <h1>Reset Password</h1>
        {email && token ? (
          <ResetPasswordForm email={email} token={token} />
        ) : (
          <>
            <p>Ask an admin to generate a reset link from the Members screen.</p>
            <Link className="secondary-login" href="/login">
              Back to login
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
