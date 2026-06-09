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
  return crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
}

function generateTxId() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `TXN-${ts}-${rnd}`;
}

module.exports = { generateApiKey, generateSessionId, generateUUID, generateTxId };
