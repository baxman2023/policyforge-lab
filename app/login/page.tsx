import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ invite?: string }> }) {
  const user = await getCurrentUser();
  if (user?.id && !user.disabledAt) {
    redirect("/");
  }

  const params = await searchParams;
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-mark" aria-label="Baxter Growth Lab" />
        <h1>Sign in to Baxter Growth Lab</h1>
        <p>Create an account or sign in with email and password. The first account becomes the admin.</p>
        <LoginForm googleConfigured={googleConfigured} inviteToken={params?.invite || ""} />
      </section>
    </main>
  );
}
