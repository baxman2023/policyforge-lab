"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { apiPath } from "@/lib/client-api";

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: "USER" | "ADMIN";
  disabledAt: Date | string | null;
  createdAt: Date | string;
  _count: {
    ideas: number;
    projects: number;
    generationLogs: number;
  };
};

export function AdminUsers({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const [rows, setRows] = useState(users);
  const [message, setMessage] = useState("");
  const activeCount = rows.filter((user) => !user.disabledAt).length;

  async function updateUser(userId: string, action: string) {
    setMessage("");
    const response = await fetch(apiPath(`/api/admin/users/${userId}`), {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({ action })
    });
    const payload = (await response.json()) as { user?: AdminUser; deleted?: boolean; error?: string };
    if (!response.ok) {
      setMessage(payload.error || "Could not update user.");
      return;
    }

    if (payload.deleted) {
      setRows((current) => current.filter((user) => user.id !== userId));
      setMessage("User deleted.");
      return;
    }

    if (payload.user) {
      setRows((current) => current.map((user) => (user.id === userId ? { ...user, ...payload.user } : user)));
      setMessage("User updated.");
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Link href="/" className="text-link">
            Back to Baxter Growth Lab
          </Link>
          <h1>Members</h1>
          <p>Keep this small group tidy. Disable people immediately, or delete accounts that do not belong.</p>
        </div>
        <div className="admin-stats">
          <strong>{activeCount}</strong>
          <span>active members</span>
        </div>
      </header>

      {message ? <div className="admin-message">{message}</div> : null}

      <section className="admin-table panel">
        <div className="admin-row admin-head">
          <div>Member</div>
          <div>Role</div>
          <div>Status</div>
          <div>Usage</div>
          <div>Actions</div>
        </div>

        {rows.map((user) => {
          const isSelf = user.id === currentUserId;
          const disabled = Boolean(user.disabledAt);
          return (
            <div className="admin-row" key={user.id}>
              <div>
                <strong>{user.name || "Unnamed member"}</strong>
                <span>{user.email}</span>
                <small>Joined {new Date(user.createdAt).toLocaleDateString()}</small>
              </div>
              <div>
                <span className={user.role === "ADMIN" ? "admin-role admin" : "admin-role"}>{user.role}</span>
              </div>
              <div>
                <span className={disabled ? "admin-status disabled" : "admin-status"}>
                  {disabled ? "Disabled" : "Active"}
                </span>
              </div>
              <div className="usage-mini">
                <span>{user._count.ideas} ideas</span>
                <span>{user._count.projects} projects</span>
                <span>{user._count.generationLogs} generations</span>
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  disabled={isSelf}
                  onClick={() => updateUser(user.id, disabled ? "enable" : "disable")}
                >
                  {disabled ? <UserCheck size={15} /> : <UserX size={15} />}
                  {disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  disabled={isSelf}
                  onClick={() => updateUser(user.id, user.role === "ADMIN" ? "make_user" : "make_admin")}
                >
                  <ShieldCheck size={15} />
                  {user.role === "ADMIN" ? "Make user" : "Make admin"}
                </button>
                <button className="danger" type="button" disabled={isSelf} onClick={() => updateUser(user.id, "delete")}>
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
