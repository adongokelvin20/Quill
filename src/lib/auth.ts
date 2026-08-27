// Quill — NextAuth configuration.
// Uses Credentials provider (email + password) with JWT session strategy
// (serverless-friendly — no DB session lookups on every request).

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // 30 days
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    // Use NEXTAUTH_SECRET or fall back to a dev-only secret
    secret: process.env.NEXTAUTH_SECRET ?? "quill-dev-secret-change-in-production",
  },
  providers: [
    CredentialsProvider({
      name: "Quill",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@school.edu.gh" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter your email and password");
        }

        const email = credentials.email.toLowerCase().trim();
        const user = await db.user.findUnique({ where: { email } });

        if (!user) {
          throw new Error("No account found with that email. Please sign up first.");
        }

        if (!user.passwordHash) {
          throw new Error("This account was created with a social login. Please use that instead.");
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          throw new Error("Incorrect password. Please try again.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    // We use a dialog instead of a dedicated sign-in page, so redirect home.
    error: "/",
  },
};

// Helper used by API routes to get the current user id (or null for anonymous)
export async function getCurrentUserId(req?: Request): Promise<string | null> {
  // For Next.js App Router API routes, we use getToken from next-auth/jwt
  const { getToken } = await import("next-auth/jwt");
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? "quill-dev-secret-change-in-production",
  });
  return (token?.id as string | undefined) ?? null;
}
