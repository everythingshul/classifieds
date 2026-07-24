const crypto = require('crypto');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'; // no 0/O/1/l/I

function newPublicId(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function newInvoiceNumber() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `INV-${y}${m}-${rand}`;
}

module.exports = { newPublicId, newInvoiceNumber };
