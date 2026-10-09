/**
 * Send a sample alert to the configured Discord channel, to confirm the webhook
 * works before relying on it.
 *
 *   DISCORD_WEBHOOK_URL=... node scripts/testDiscordAlert.js
 *   npm run alert:test            (reads DISCORD_WEBHOOK_URL from backend/.env)
 */
import 'dotenv/config';
import { alertDiscord, flushDiscordAlerts, discordAlertsEnabled } from '../utils/discordAlert.js';

if (!discordAlertsEnabled()) {
  console.error(
    'Discord alerts are OFF. Set DISCORD_WEBHOOK_URL in backend/.env (and do not run with NODE_ENV=test).',
  );
  process.exit(1);
}

alertDiscord('info', 'Test alert', {
  message: 'If you can see this in Discord, dev alerts are wired correctly. Real alerts fire on 500s, failed jobs and crashes.',
  request_id: 'test-' + Date.now().toString(36),
  route: '/scripts/testDiscordAlert',
});

await flushDiscordAlerts();
console.log('Sent. Check the Discord channel.');
process.exit(0);
