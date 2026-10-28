import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const e = env();
  transporter = e.SMTP_HOST
    ? nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT ?? 587,
        secure: e.SMTP_SECURE,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      })
    : null;
  return transporter;
}

export function emailConfigured(): boolean {
  return Boolean(env().SMTP_HOST);
}

/**
 * Sends an email. When SMTP is not configured (local development) the message is written to
 * the server log instead and `delivered: false` is returned so callers can surface the link
 * to the admin through the UI.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ delivered: boolean }> {
  const t = getTransporter();
  if (!t) {
    if (env().NODE_ENV !== "test") {
      console.info(`[email:not-configured] To: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}`);
    }
    return { delivered: false };
  }
  await t.sendMail({ from: env().EMAIL_FROM, ...msg });
  return { delivered: true };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function simpleHtml(title: string, lines: string[], cta?: { label: string; url: string }): string {
  const body = lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join("");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a"><h2>${escapeHtml(title)}</h2>${body}${button}<p style="color:#64748b;font-size:12px">Suroskie Creative Performance Portal</p></div>`;
}
