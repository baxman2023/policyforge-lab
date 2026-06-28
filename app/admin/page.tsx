import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminUsers } from "@/components/admin-users";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function AdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id || currentUser.disabledAt) redirect("/login");
  if (currentUser.role !== UserRole.ADMIN) redirect("/");

  const users = await prisma.user.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      disabledAt: true,
      createdAt: true,
      _count: {
        select: {
          ideas: true,
          projects: true,
          generationLogs: true
        }
      }
    }
  });

  return (
    <AdminUsers
      users={users.map((user) => ({
        ...user,
        disabledAt: user.disabledAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString()
      }))}
      currentUserId={currentUser.id}
    />
  );
}
