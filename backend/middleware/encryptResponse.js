import crypto from 'crypto';

const ENABLED = process.env.ENCRYPT_API_RESPONSES === 'true';
const SECRET  = process.env.API_RESPONSE_SECRET || '';

// SHA-256 of the secret → stable 32-byte AES key, matches Web Crypto on the frontend.
let _key = null;
function getKey() {
  if (!_key) {
    if (!SECRET) throw new Error('API_RESPONSE_SECRET must be set when ENCRYPT_API_RESPONSES=true');
    _key = crypto.createHash('sha256').update(SECRET).digest();
  }
  return _key;
}

// Paths that external monitors / load balancers hit — skip encryption there.
const SKIP_PREFIXES = ['/api/health', '/api/observability'];

export function encryptResponse(req, res, next) {
  if (!ENABLED) return next();
  if (SKIP_PREFIXES.some(p => req.path.startsWith(p.slice(4)))) return next(); // req.path is relative to mount

  const originalJson = res.json.bind(res);
  res.json = function encryptedJson(body) {
    try {
      const key = getKey();
      const iv  = crypto.randomBytes(12); // 96-bit IV for GCM
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag(); // 16 bytes

      // Append tag to ciphertext so the frontend feeds one buffer to Web Crypto.
      return originalJson({
        _enc: true,
        iv:   iv.toString('base64'),
        data: Buffer.concat([ciphertext, tag]).toString('base64'),
      });
    } catch (_) {
      // Never let a crypto error break the response — fall back to plaintext.
      return originalJson(body);
    }
  };
  next();
}
