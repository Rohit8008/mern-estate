import express from 'express';
import rateLimit from 'express-rate-limit';
import { sendMail } from '../utils/mailer.js';
import { renderEmail } from '../utils/emailLayout.js';

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

  // renderEmail escapes every value, so stranger-typed text can't inject markup.

  // Notify owner. The request exists nowhere else, so if this fails the
  // visitor is told so rather than being told "received" for a lost lead.
  const ownerMail = renderEmail({
    preheader: `${name.trim().slice(0, 120)} from ${company.trim().slice(0, 150)} wants a demo`,
    heading: 'New demo request',
    paragraphs: ['Someone wants to see Real Vista CRM in action. Reply to this email to answer them directly.'],
    details: [
      ['Name', name.trim().slice(0, 120)],
      ['Email', email.trim().slice(0, 254)],
      ['Phone', (phone || '').slice(0, 30)],
      ['Company', company.trim().slice(0, 150)],
      ['Team size', (teamSize || '').slice(0, 20)],
      ['Message', (message || '').slice(0, 2000)],
    ],
    footer: 'Sent by the Real Vista website contact form.',
  });
  const notified = await sendMail({
    to: OWNER_EMAIL,
    subject: `New Demo Request — ${company.trim().slice(0, 150)} (${name.trim().slice(0, 120)})`,
    replyTo: email.trim(),
    ...ownerMail,
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
    ...renderEmail({
      preheader: "We've received your demo request.",
      heading: 'Thanks for your request',
      paragraphs: [
        "We've received your demo request and will get back to you within 24 hours.",
        `In the meantime you can reach us at ${OWNER_EMAIL}.`,
      ],
      footer: 'Real Vista — CRM for real estate agencies. We use these details only to arrange your demo. Reply "delete" and we will remove them.',
    }),
  });

  res.status(200).json({ success: true, message: 'Request received! We will be in touch within 24 hours.' });
});

export default router;
