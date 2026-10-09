require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const encKey = required('ENC_KEY');
if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
  console.error('[config] ENC_KEY must be 64 hex characters (32 bytes).');
  process.exit(1);
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || './data/energia.db',
  jwtSecret: required('JWT_SECRET'),
  encKey: Buffer.from(encKey, 'hex'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  demoMode: process.env.DEMO_MODE === 'true',
  notifyChannel: process.env.NOTIFY_CHANNEL || 'log',
  resendApiKey: process.env.RESEND_API_KEY || null,
  demoNotifyEmail: process.env.DEMO_NOTIFY_EMAIL || null,
};