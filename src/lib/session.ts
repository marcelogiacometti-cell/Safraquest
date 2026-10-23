import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';

const key = () => new TextEncoder().encode(env.sessionSecret);
export const SESSION_COOKIE = 'sq_session';

export type SessionPayload = { uid: string; kind: 'session' | 'magic'; mid?: string };

export async function signToken(p: SessionPayload, ttlSeconds: number): Promise<string> {
  return new SignJWT({ ...p }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds).sign(key());
}

export async function readToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.uid !== 'string') return null;
    return { uid: payload.uid, kind: payload.kind as SessionPayload['kind'], mid: payload.mid as string | undefined };
  } catch { return null; }
}

export const THIRTY_DAYS = 30 * 24 * 3600;
export const TWELVE_HOURS = 12 * 3600;
