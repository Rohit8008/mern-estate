import Twilio from 'twilio';

export const sendSms = async ({ to, body }) => {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      return { sent: false, reason: 'SMS not configured' };
    }
    const client = Twilio(sid, token);
    const msg = await client.messages.create({ to, from, body });
    return { sent: true, id: msg.sid };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
};


