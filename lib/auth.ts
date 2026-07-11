import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const ADMIN_EMAIL = "keithbax@gmail.com";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    ...(googleConfigured
      ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!
        })
      ]
      : [])
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, disabledAt: true, role: true } });
      if (existing?.disabledAt) return false;
      if (existing && email === ADMIN_EMAIL && existing.role !== UserRole.ADMIN) {
        await prisma.user.update({ where: { id: existing.id }, data: { role: UserRole.ADMIN } });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }

      if (token.sub) {
        const tokenEmail = typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
        if (tokenEmail === ADMIN_EMAIL) {
          await prisma.user.updateMany({ where: { id: token.sub, role: { not: UserRole.ADMIN } }, data: { role: UserRole.ADMIN } });
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, disabledAt: true }
        });
        token.role = dbUser?.role ?? UserRole.USER;
        token.disabledAt = dbUser?.disabledAt?.toISOString() ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as UserRole) ?? UserRole.USER;
        session.user.disabledAt = typeof token.disabledAt === "string" ? token.disabledAt : null;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET || "policyforge-lab-local-development-secret"
};
