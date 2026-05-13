import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { logger } from '../util/log.js';

const log = logger('email');

let cached: Transporter | null = null;

function transport(): Transporter {
  if (cached) return cached;
  const e = env();
  cached = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465, // 465 implies SSL; 587 uses STARTTLS
    auth: {
      user: e.SMTP_USER,
      pass: e.SMTP_PASS,
    },
  });
  return cached;
}

function fromAddress(): string {
  const e = env();
  return e.SMTP_FROM_NAME ? `"${e.SMTP_FROM_NAME}" <${e.SMTP_FROM}>` : e.SMTP_FROM;
}

function frontendUrl(): string {
  return env().FRONTEND_URL.replace(/\/+$/, '');
}

export async function sendVerificationEmail(args: { to: string; token: string }): Promise<void> {
  const url = `${frontendUrl()}/verify-email?token=${args.token}`;
  const html = `
    <p>Welcome to Check My Legals.</p>
    <p>Click the link below to verify your email address:</p>
    <p><a href="${url}">${url}</a></p>
    <p>The link expires in 24 hours. If you didn't sign up for Check My Legals, ignore this email.</p>
  `;
  await transport().sendMail({
    from: fromAddress(),
    to: args.to,
    subject: 'Verify your Check My Legals account',
    html,
    text: `Verify your email: ${url}\n\nThe link expires in 24 hours.`,
  });
  log.info(`sent verification email to ${args.to}`);
}

/**
 * Diagnostic — used by /api/diag/email. Sends a tiny test message and
 * returns the SMTP server's accepted/rejected result. Throws on auth or
 * connection failure so the caller can surface the error verbatim.
 */
export async function sendTestEmail(args: { to: string }): Promise<{
  accepted: string[];
  rejected: string[];
  response: string;
  messageId: string;
}> {
  const t = transport();
  // verify() does the auth/handshake without sending — fail fast.
  await t.verify();
  const info = await t.sendMail({
    from: fromAddress(),
    to: args.to,
    subject: 'Check My Legals — SMTP diagnostic',
    text: 'If you can read this, your Plesk SMTP credentials are wired correctly.',
  });
  log.info(`sent SMTP diagnostic email to ${args.to}`);
  return {
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: info.response,
    messageId: info.messageId,
  };
}

export async function sendPasswordResetEmail(args: { to: string; token: string }): Promise<void> {
  const url = `${frontendUrl()}/reset-password?token=${args.token}`;
  const html = `
    <p>Someone (hopefully you) asked to reset the password for this Check My Legals account.</p>
    <p>Click the link below to set a new password:</p>
    <p><a href="${url}">${url}</a></p>
    <p>The link expires in 1 hour. If you didn't ask for a reset, ignore this email — your password is unchanged.</p>
  `;
  await transport().sendMail({
    from: fromAddress(),
    to: args.to,
    subject: 'Reset your Check My Legals password',
    html,
    text: `Reset your password: ${url}\n\nThe link expires in 1 hour.`,
  });
  log.info(`sent password-reset email to ${args.to}`);
}
