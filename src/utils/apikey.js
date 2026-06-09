// src/utils/apikey.js
const crypto = require('crypto');

function generateApiKey() {
  const hex = crypto.randomBytes(24).toString('hex').toUpperCase();
  return `AND+${hex}`;
}

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function generateUUID() {
  // FIX: crypto.randomUUID available Node >= 14.17 — safe fallback for older envs
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback: RFC 4122 v4 UUID from random bytes
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0,8), hex.slice(8,12), hex.slice(12,16),
    hex.slice(16,20), hex.slice(20,32)
  ].join('-');
}

function generateTxId() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `TXN-${ts}-${rnd}`;
}

module.exports = { generateApiKey, generateSessionId, generateUUID, generateTxId };
