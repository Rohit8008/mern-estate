/**
 * Builds the self-service "Your data" download as a printable ID card rather
 * than a raw JSON dump. The output is one self-contained HTML document (no
 * external CSS, scripts or fonts) so it opens offline in any browser and prints
 * or "Save as PDF"s cleanly. It carries only the person's profile basics and a
 * count of what they have created — never other people's data or log lines.
 */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ROLE_LABELS = {
  admin: 'Administrator',
  employee: 'Employee',
  seller: 'Seller',
  buyer: 'Buyer',
  user: 'User',
};

function fullName(profile) {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  return name || profile.username || 'Team member';
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(profile) {
  const name = fullName(profile);
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || 'U';
}

/**
 * @param {object} args
 * @param {object} args.profile  { id, username, firstName, lastName, email, phone, role, avatar, memberSince }
 * @param {object} args.counts   { clients, owners, buyerRequirements, tasks, documents, listings }
 * @param {object} [args.workspace]  { name, logoUrl }
 * @returns {string} a complete HTML document
 */
export function buildDataCardHtml({ profile = {}, counts = {}, workspace = {} }) {
  const name = fullName(profile);
  const role = ROLE_LABELS[profile.role] || profile.role || 'Member';
  const wsName = workspace.name || 'Real Vista';
  const generated = new Date().toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const avatar = profile.avatar
    ? `<img src="${esc(profile.avatar)}" alt="" class="avatar-img" />`
    : `<span class="avatar-initials">${esc(initials(profile))}</span>`;

  const logo = workspace.logoUrl
    ? `<img src="${esc(workspace.logoUrl)}" alt="" class="brand-logo" />`
    : `<span class="brand-mark">${esc(wsName.charAt(0).toUpperCase())}</span>`;

  const stats = [
    ['Properties', counts.listings],
    ['Clients', counts.clients],
    ['Owners', counts.owners],
    ['Buyer needs', counts.buyerRequirements],
    ['Tasks', counts.tasks],
    ['Documents', counts.documents],
  ]
    .map(
      ([label, value]) => `
        <div class="stat">
          <div class="stat-value">${esc(Number(value || 0))}</div>
          <div class="stat-label">${esc(label)}</div>
        </div>`
    )
    .join('');

  const detail = (label, value) => `
        <div class="row">
          <span class="row-label">${esc(label)}</span>
          <span class="row-value">${esc(value || '—')}</span>
        </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(name)} — ${esc(wsName)} ID card</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: #eef2f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a; padding: 32px;
  }
  .card {
    width: 420px; max-width: 100%;
    background: #fff; border-radius: 20px; overflow: hidden;
    box-shadow: 0 20px 45px rgba(15, 23, 42, .18);
    border: 1px solid #e2e8f0;
  }
  .banner {
    background: linear-gradient(135deg, #1d588a, #143755);
    color: #fff; padding: 20px 24px;
    display: flex; align-items: center; gap: 12px;
  }
  .brand-logo { height: 34px; width: 34px; border-radius: 9px; object-fit: cover; background:#fff; }
  .brand-mark {
    height: 34px; width: 34px; border-radius: 9px;
    background: rgba(255,255,255,.18); display: inline-flex;
    align-items: center; justify-content: center; font-weight: 700; font-size: 18px;
  }
  .brand-name { font-size: 16px; font-weight: 700; letter-spacing: .2px; }
  .brand-sub { font-size: 11px; opacity: .8; margin-top: 1px; text-transform: uppercase; letter-spacing: 1.5px; }
  .identity { padding: 28px 24px 8px; text-align: center; }
  .avatar {
    height: 96px; width: 96px; border-radius: 50%; margin: 0 auto 14px;
    background: linear-gradient(135deg, #488ac5, #1d588a);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; border: 3px solid #fff;
    box-shadow: 0 6px 18px rgba(29, 88, 138, .28);
  }
  .avatar-img { height: 100%; width: 100%; object-fit: cover; }
  .avatar-initials { color: #fff; font-size: 34px; font-weight: 700; }
  .name { font-size: 22px; font-weight: 700; margin: 0; }
  .role {
    display: inline-block; margin-top: 8px; padding: 4px 12px;
    background: #e1eefc; color: #1d588a; border-radius: 999px;
    font-size: 12px; font-weight: 600;
  }
  .details { padding: 16px 24px 4px; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .row:last-child { border-bottom: none; }
  .row-label { color: #64748b; }
  .row-value { color: #0f172a; font-weight: 600; text-align: right; word-break: break-word; }
  .stats-title { padding: 18px 24px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 10px 24px 24px; }
  .stat { background: #f8fafc; border: 1px solid #eef2f7; border-radius: 12px; padding: 12px 8px; text-align: center; }
  .stat-value { font-size: 20px; font-weight: 700; color: #1d588a; }
  .stat-label { font-size: 10.5px; color: #64748b; margin-top: 2px; }
  .footer { padding: 14px 24px; background: #f8fafc; border-top: 1px solid #eef2f7; font-size: 11px; color: #94a3b8; text-align: center; }
  .footer .uid { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  @media print {
    body { background: #fff; padding: 0; }
    .card { box-shadow: none; border: 1px solid #cbd5e1; }
  }
</style>
</head>
<body>
  <main class="card">
    <div class="banner">
      ${logo}
      <div>
        <div class="brand-name">${esc(wsName)}</div>
        <div class="brand-sub">Member ID card</div>
      </div>
    </div>

    <div class="identity">
      <div class="avatar">${avatar}</div>
      <h1 class="name">${esc(name)}</h1>
      <div class="role">${esc(role)}</div>
    </div>

    <div class="details">
      ${detail('Username', profile.username)}
      ${detail('Email', profile.email)}
      ${detail('Phone', profile.phone)}
      ${detail('Member since', formatDate(profile.memberSince))}
    </div>

    <div class="stats-title">What you've created</div>
    <div class="stats">${stats}</div>

    <div class="footer">
      Generated on ${esc(generated)} · ID <span class="uid">${esc(String(profile.id || '').slice(-8) || '—')}</span>
    </div>
  </main>
</body>
</html>`;
}
