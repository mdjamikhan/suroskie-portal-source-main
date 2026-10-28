import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail, simpleHtml } from "@/lib/email";
import { audit } from "@/lib/audit";

export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const MIN_PASSWORD_LENGTH = 12;

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Suroskie Creative Performance Portal",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      // Access is invitation-only: nobody can self-register into advertising data.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { status: true } });
        if (dbUser?.status !== "ACTIVE") return; // silently ignore: no reset for suspended/invited users
        await sendEmail({
          to: user.email,
          subject: "Reset your Suroskie portal password",
          text: `A password reset was requested for your account. This link expires in 1 hour:\n${url}\n\nIf you did not request this, you can ignore this email.`,
          html: simpleHtml("Reset your password", ["A password reset was requested for your account. The link expires in 1 hour.", "If you did not request this, ignore this email."], { label: "Reset password", url }),
        });
      },
      onPasswordReset: async ({ user }) => {
        await audit({ userId: user.id, email: user.email }, "auth.password_reset", "Password reset completed", { targetType: "user", targetId: user.id });
      },
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: 60 * 60,
      // No cookie cache: every request re-validates the session row, so revocation is immediate.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: e.NODE_ENV !== "test",
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "suroskie",
      useSecureCookies: e.APP_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: e.APP_URL.startsWith("https://") },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { status: true } });
            if (!user || user.status !== "ACTIVE") {
              throw new APIError("FORBIDDEN", { message: "This account is not active. Contact your administrator." });
            }
          },
          after: async (session) => {
            const user = await prisma.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() }, select: { email: true } });
            await audit({ userId: session.userId, email: user.email, ipAddress: session.ipAddress, userAgent: session.userAgent }, "auth.sign_in", "Signed in", { targetType: "user", targetId: session.userId });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __auth?: Auth };

/** Lazily constructed so that importing this module never requires env at build time. */
export function getAuth(): Auth {
  if (!g.__auth) g.__auth = createAuth();
  return g.__auth;
}
