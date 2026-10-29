export const env = {
  get appUrl() { return process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'; },
  get sessionSecret() {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 32) throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres');
    return s;
  },
  get cronSecret() { return process.env.CRON_SECRET ?? ''; },
  get waProvider() { return process.env.WHATSAPP_PROVIDER ?? 'console'; },
  get smtpHost() { return process.env.SMTP_HOST ?? ''; },
  get graphVersion() { return process.env.WHATSAPP_GRAPH_VERSION ?? 'v21.0'; },
};
