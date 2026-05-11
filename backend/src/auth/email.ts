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
    <p>Welcome to Lens.</p>
    <p>Click the link below to verify your email address:</p>
    <p><a href="${url}">${url}</a></p>
    <p>The link expires in 24 hours. If you didn't sign up for Lens, ignore this email.</p>
  `;
  await transport().sendMail({
    from: fromAddress(),
    to: args.to,
    subject: 'Verify your Lens account',
    html,
    text: `Verify your email: ${url}\n\nThe link expires in 24 hours.`,
  });
  log.info(`sent verification email to ${args.to}`);
}

export async function sendPasswordResetEmail(args: { to: string; token: string }): Promise<void> {
  const url = `${frontendUrl()}/reset-password?token=${args.token}`;
  const html = `
    <p>Someone (hopefully you) asked to reset the password for this Lens account.</p>
    <p>Click the link below to set a new password:</p>
    <p><a href="${url}">${url}</a></p>
    <p>The link expires in 1 hour. If you didn't ask for a reset, ignore this email — your password is unchanged.</p>
  `;
  await transport().sendMail({
    from: fromAddress(),
    to: args.to,
    subject: 'Reset your Lens password',
    html,
    text: `Reset your password: ${url}\n\nThe link expires in 1 hour.`,
  });
  log.info(`sent password-reset email to ${args.to}`);
}
