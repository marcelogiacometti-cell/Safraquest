import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

function key(): Buffer {
  return createHash('sha256').update('enc:' + env.sessionSecret).digest();
}

/** Criptografa segredos (token da Meta, segredo do app) antes de gravar no banco. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export function hmac(value: string): string {
  return createHmac('sha256', env.sessionSecret).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}
