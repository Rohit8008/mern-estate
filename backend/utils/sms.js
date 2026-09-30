import Twilio from 'twilio';
import { logger } from './logger.js';

export const sendSms = async ({ to, body }) => {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      logger.warn('SMS not sent: Twilio not configured');
      return { sent: false, reason: 'SMS not configured' };
    }
    const client = Twilio(sid, token);
    const msg = await client.messages.create({ to, from, body });
    // Last four digits only: enough to match a complaint, not a phone book.
    logger.info('SMS sent', { sid: msg.sid, to_last4: String(to).slice(-4) });
    return { sent: true, id: msg.sid };
  } catch (e) {
    logger.error('SMS send failed', { error: e, to_last4: String(to || '').slice(-4) });
    return { sent: false, reason: e.message };
  }
};


