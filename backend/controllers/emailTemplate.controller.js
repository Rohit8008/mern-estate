import EmailTemplate, { TEMPLATE_KEYS, TEMPLATE_VARIABLES } from '../models/emailTemplate.model.js';
import { sanitiseTemplateHtml, renderTemplate, templateValues } from '../utils/emailTemplates.js';
import { sendMail } from '../utils/mailer.js';
import { errorHandler } from '../utils/error.js';
import { logFromRequest } from '../utils/activity.js';
import User from '../models/user.model.js';
import { inHomeTenant } from '../tenancy/tenantContext.js';

/** Sample values, so a preview shows something recognisable rather than blanks. */
const SAMPLE = {
  recipientName: 'Priya Sharma',
  title: 'New lead assigned: Anil Kumar',
  body: 'Budget 85L–1.1Cr, looking in Whitefield. Assigned automatically (round robin).',
  link: 'https://example.com/clients/000000000000000000000000',
  actorName: 'Rahul Verma',
};

export const listEmailTemplates = async (req, res, next) => {
  try {
    const templates = await EmailTemplate.find({}).lean();
    const byKey = new Map(templates.map((t) => [t.key, t]));

    res.json({
      success: true,
      data: {
        // Every key the workspace *could* override, with its override attached
        // where one exists — so the screen lists the full set rather than only
        // what has already been customised.
        templates: TEMPLATE_KEYS.map((key) => ({
          key,
          customised: byKey.has(key),
          ...(byKey.get(key) || {}),
        })),
        variables: TEMPLATE_VARIABLES,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const upsertEmailTemplate = async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!TEMPLATE_KEYS.includes(key)) return next(errorHandler(400, 'Unknown template'));

    const { subject, html, isActive } = req.body || {};
    if (!subject || !String(subject).trim()) return next(errorHandler(400, 'The email needs a subject'));
    if (!html || !String(html).trim()) return next(errorHandler(400, 'The email needs a body'));

    const template = await EmailTemplate.findOneAndUpdate(
      { key },
      {
        $set: {
          key,
          subject: String(subject).trim().slice(0, 200),
          // Sanitised on the way in, so what is stored is already safe to send.
          html: sanitiseTemplateHtml(html),
          isActive: isActive !== false,
          updatedBy: req.user.id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'email_template.saved',
      message: `Saved the "${key}" email template`,
    });

    res.json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
};

/** Revert to the built-in wording. */
export const deleteEmailTemplate = async (req, res, next) => {
  try {
    const result = await EmailTemplate.deleteOne({ key: req.params.key });
    if (!result.deletedCount) return next(errorHandler(404, 'No override to remove'));

    res.json({ success: true, message: 'Reverted to the default wording' });
  } catch (err) {
    next(err);
  }
};

/**
 * Render a draft without saving it, so an admin can see what they are writing.
 * The draft is sanitised here too — a preview is rendered in a browser.
 */
export const previewEmailTemplate = async (req, res, next) => {
  try {
    const { subject, html } = req.body || {};
    const values = templateValues(SAMPLE);

    res.json({
      success: true,
      data: {
        subject: renderTemplate(String(subject || ''), values),
        html: renderTemplate(sanitiseTemplateHtml(html), values),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Send the rendered draft to the admin's own address.
 *
 * Deliberately only ever to themselves: a "send test to…" box that accepts any
 * address is a way to send mail from the workspace's domain to a stranger.
 */
export const sendTestEmail = async (req, res, next) => {
  try {
    const user = await inHomeTenant(req, () => User.findById(req.user.id).select('email username').lean());
    if (!user?.email) return next(errorHandler(400, 'Your account has no email address'));

    const values = templateValues({ ...SAMPLE, recipientName: user.username || 'there' });
    const subject = renderTemplate(String(req.body?.subject || 'Test email'), values);
    const html = renderTemplate(sanitiseTemplateHtml(req.body?.html || '<p>Test</p>'), values);

    const result = await sendMail({ to: user.email, subject, html, text: 'Test email from your CRM.' });

    if (!result.sent) {
      return res.status(502).json({
        success: false,
        message:
          result.reason === 'not_configured'
            ? 'No mail server is configured yet. Add SMTP settings first.'
            : `Could not send: ${result.error || result.reason}`,
      });
    }

    res.json({ success: true, message: `Sent to ${user.email}`, data: { via: result.via } });
  } catch (err) {
    next(err);
  }
};
