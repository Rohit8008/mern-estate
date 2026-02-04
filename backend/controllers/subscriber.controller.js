import Subscriber from '../models/subscriber.model.js';
import { sendMail } from '../utils/mailer.js';

const welcomeEmailHtml = (email) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e3a5f;padding:32px 40px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="width:40px;height:40px;background-color:#2563eb;border-radius:10px;text-align:center;vertical-align:middle;">
                    <span style="color:#ffffff;font-weight:bold;font-size:20px;">R</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="color:#ffffff;font-size:24px;font-weight:bold;">RealVista</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:24px;color:#1e293b;">Welcome to RealVista!</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
                Thank you for subscribing to our newsletter. You're now part of a community that stays ahead of the real estate market.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
                Here's what you'll receive from us:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;background-color:#eff6ff;border-radius:8px;margin-bottom:8px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#1e40af;font-weight:600;">New Property Listings</p>
                    <p style="margin:0;font-size:13px;color:#475569;">Be the first to know about new properties on the market.</p>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px;background-color:#f0fdf4;border-radius:8px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#166534;font-weight:600;">Market Insights</p>
                    <p style="margin:0;font-size:13px;color:#475569;">Stay informed with the latest trends and price analyses.</p>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px;background-color:#fefce8;border-radius:8px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#854d0e;font-weight:600;">Exclusive Deals</p>
                    <p style="margin:0;font-size:13px;color:#475569;">Get access to special offers before anyone else.</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
                In the meantime, feel free to browse our latest listings:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2563eb;border-radius:8px;">
                    <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/search" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      Browse Properties
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-align:center;">
                You're receiving this email because ${email} subscribed to our newsletter.
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                &copy; 2026 RealVista. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const subscribe = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const existing = await Subscriber.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'This email is already subscribed' });
    }

    await Subscriber.create({ email });

    // Send welcome email (non-blocking — don't fail the subscription if email fails)
    sendMail({
      to: email,
      subject: 'Welcome to RealVista Newsletter!',
      text: 'Thank you for subscribing to the RealVista newsletter. You will now receive the latest property listings and market insights.',
      html: welcomeEmailHtml(email),
    }).catch((err) => {
      console.error('[subscriber] Failed to send welcome email:', err);
    });

    res.status(201).json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    next(error);
  }
};
