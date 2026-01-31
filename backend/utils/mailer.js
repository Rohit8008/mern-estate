import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: (SMTP_PORT ? String(SMTP_PORT) : '587') === '465',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    console.warn('[mailer] SMTP not configured. Set SMTP_USER and SMTP_PASS (+ optional SMTP_HOST/SMTP_PORT/SMTP_FROM)');
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e) {
    console.error('[mailer] sendMail error', e);
    return { sent: false, reason: 'send_failed', error: e?.message };
  }
}


