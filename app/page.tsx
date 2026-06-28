import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { IdeaFactoryApp } from "@/components/idea-factory-app";
import { getCurrentUser } from "@/lib/session";
import { ensureUserWorkspace, isWorkspaceActive } from "@/lib/workspaces";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user?.id || user.disabledAt) {
    redirect("/login");
  }
  const { workspace } = await ensureUserWorkspace(user.id);
  if (user.role !== UserRole.ADMIN && !isWorkspaceActive(workspace)) {
    return (
      <main className="workspace-lock-page">
        <section className="workspace-lock-panel">
          <h1>{workspace.name} is inactive</h1>
          <p>Your workspace subscription is currently inactive. Contact your workspace owner to reactivate access.</p>
        </section>
      </main>
    );
  }

  return <IdeaFactoryApp user={user} />;
}
