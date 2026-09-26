import express from 'express';
import rateLimit from 'express-rate-limit';
import { sendMail } from '../utils/mailer.js';
import { escapeHtml } from '../utils/search.js';

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.post('/', contactLimiter, async (req, res) => {
  // Strings only: an object or array here would throw on .trim() below.
  const field = (v) => (typeof v === 'string' ? v : '');
  const name = field(req.body?.name);
  const email = field(req.body?.email);
  const phone = field(req.body?.phone);
  const company = field(req.body?.company);
  const teamSize = field(req.body?.teamSize);
  const message = field(req.body?.message);

  if (!name?.trim() || !email?.trim() || !company?.trim()) {
    return res.status(400).json({ success: false, message: 'Name, email and company are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  const OWNER_EMAIL = process.env.SMTP_USER || 'mittalrohit701@gmail.com';

  // Every value below is typed by a stranger and lands in an HTML email — one
  // of them in an auto-reply to whatever address they typed. Unescaped, the
  // form sent attacker-written HTML from our domain to any inbox.
  const safe = {
    name: escapeHtml(name.trim()).slice(0, 120),
    email: escapeHtml(email.trim()).slice(0, 254),
    phone: escapeHtml(phone || '').slice(0, 30),
    company: escapeHtml(company.trim()).slice(0, 150),
    teamSize: escapeHtml(teamSize || '').slice(0, 20),
    message: escapeHtml(message || '').slice(0, 2000),
  };

  // Notify owner. The request exists nowhere else, so if this fails the
  // visitor is told so rather than being told "received" for a lost lead.
  const notified = await sendMail({
    to: OWNER_EMAIL,
    subject: `New Demo Request — ${company.trim().slice(0, 150)} (${name.trim().slice(0, 120)})`,
    replyTo: email.trim(),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1e293b;margin-bottom:4px">New Demo Request</h2>
        <p style="color:#64748b;margin-top:0;margin-bottom:24px">Someone wants to see Real Vista CRM in action.</p>
        <table style="width:100%;border-collapse:collapse">
          ${[
            ['Name',       safe.name],
            ['Email',      safe.email],
            ['Phone',      safe.phone || '—'],
            ['Company',    safe.company],
            ['Team Size',  safe.teamSize || '—'],
            ['Message',    safe.message || '—'],
          ].map(([k, v]) => `
            <tr>
              <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;font-size:13px;width:120px;font-weight:600">${k}</td>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;font-size:14px">${v}</td>
            </tr>`).join('')}
        </table>
        <div style="margin-top:24px;padding:16px;background:#eef2ff;border-radius:8px">
          <p style="margin:0;color:#4338ca;font-size:13px">
            Reply to this email or call <strong>${safe.phone || 'number not provided'}</strong> to follow up.
          </p>
        </div>
      </div>`,
  });

  if (!notified?.sent) {
    return res.status(503).json({
      success: false,
      message: `We couldn't send your request just now. Please email ${OWNER_EMAIL} instead.`,
    });
  }

  // Auto-reply to prospect. It goes to whatever address was typed, so it
  // repeats nothing the visitor wrote: otherwise the form lets anyone put their
  // own words, from our domain, into a stranger's inbox.
  await sendMail({
    to: email,
    subject: `We got your request — Real Vista`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1e293b">Thanks for your request</h2>
        <p style="color:#475569">We've received your demo request and will get back to you within <strong>24 hours</strong>.</p>
        <p style="color:#475569">In the meantime, feel free to reach us directly:</p>
        <ul style="color:#475569">
          <li>Email: <a href="mailto:${OWNER_EMAIL}" style="color:#4f46e5">${OWNER_EMAIL}</a></li>
        </ul>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">Real Vista — CRM for real estate agencies. We use these details only to arrange your demo. Reply "delete" and we will remove them.</p>
      </div>`,
  });

  res.status(200).json({ success: true, message: 'Request received! We will be in touch within 24 hours.' });
});

export default router;
