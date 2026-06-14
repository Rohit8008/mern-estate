import express from 'express';
import rateLimit from 'express-rate-limit';
import { sendMail } from '../utils/mailer.js';

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.post('/', contactLimiter, async (req, res) => {
  const { name, email, phone, company, teamSize, message } = req.body;

  if (!name?.trim() || !email?.trim() || !company?.trim()) {
    return res.status(400).json({ success: false, message: 'Name, email and company are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  const OWNER_EMAIL = process.env.SMTP_USER || 'mittalrohit701@gmail.com';

  // Notify owner
  await sendMail({
    to: OWNER_EMAIL,
    subject: `New Demo Request — ${company} (${name})`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1e293b;margin-bottom:4px">New Demo Request</h2>
        <p style="color:#64748b;margin-top:0;margin-bottom:24px">Someone wants to see Real Vista CRM in action.</p>
        <table style="width:100%;border-collapse:collapse">
          ${[
            ['Name',       name],
            ['Email',      email],
            ['Phone',      phone || '—'],
            ['Company',    company],
            ['Team Size',  teamSize || '—'],
            ['Message',    message || '—'],
          ].map(([k, v]) => `
            <tr>
              <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;font-size:13px;width:120px;font-weight:600">${k}</td>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;font-size:14px">${v}</td>
            </tr>`).join('')}
        </table>
        <div style="margin-top:24px;padding:16px;background:#eef2ff;border-radius:8px">
          <p style="margin:0;color:#4338ca;font-size:13px">
            Reply to this email or call <strong>${phone || 'number not provided'}</strong> to follow up.
          </p>
        </div>
      </div>`,
  });

  // Auto-reply to prospect
  await sendMail({
    to: email,
    subject: `We got your request — Real Vista`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1e293b">Thanks, ${name.split(' ')[0]}!</h2>
        <p style="color:#475569">We've received your demo request for <strong>${company}</strong> and will get back to you within <strong>24 hours</strong>.</p>
        <p style="color:#475569">In the meantime, feel free to reach us directly:</p>
        <ul style="color:#475569">
          <li>Email: <a href="mailto:${OWNER_EMAIL}" style="color:#4f46e5">${OWNER_EMAIL}</a></li>
        </ul>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">Real Vista — Find Your Perfect Property</p>
      </div>`,
  });

  res.status(200).json({ success: true, message: 'Request received! We will be in touch within 24 hours.' });
});

export default router;
