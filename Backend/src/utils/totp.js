const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input) {
  const normalized = String(input || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');

  let bits = 0;
  let value = 0;
  const output = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateBase32Secret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function generateHotp(secret, counter, digits = 6) {
  const secretBuffer = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 10 ** digits).padStart(digits, '0');
}

function generateTotp(secret, options = {}) {
  const step = options.step || 30;
  const digits = options.digits || 6;
  const timestamp = options.timestamp || Date.now();
  const counter = Math.floor(timestamp / 1000 / step);
  return generateHotp(secret, counter, digits);
}

function verifyTotp(code, secret, options = {}) {
  const normalizedCode = String(code || '').replace(/\s+/g, '');
  const window = options.window ?? 1;
  const step = options.step || 30;
  const digits = options.digits || 6;
  const timestamp = options.timestamp || Date.now();
  const currentCounter = Math.floor(timestamp / 1000 / step);

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateHotp(secret, currentCounter + offset, digits);
    if (expected === normalizedCode) {
      return true;
    }
  }

  return false;
}

function buildOtpAuthUrl({ issuer, accountName, secret }) {
  const encodedLabel = encodeURIComponent(`${issuer}:${accountName}`);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedSecret = encodeURIComponent(secret);
  return `otpauth://totp/${encodedLabel}?secret=${encodedSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateBase32Secret,
  generateTotp,
  verifyTotp,
  buildOtpAuthUrl,
};
