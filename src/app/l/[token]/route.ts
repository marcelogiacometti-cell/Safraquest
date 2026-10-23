import { NextResponse } from 'next/server';
import { readToken, signToken, SESSION_COOKIE, THIRTY_DAYS } from '@/lib/session';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { env } from '@/lib/env';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = env.appUrl;
  const p = await readToken(token);
  if (!p || p.kind !== 'magic') return NextResponse.redirect(`${base}/entrar?motivo=link`);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, p.uid));
  if (!u || u.status !== 'ACTIVE') return NextResponse.redirect(`${base}/entrar`);
  const res = NextResponse.redirect(`${base}${p.mid ? '/app/quiz/' + p.mid : '/app'}`);
  res.cookies.set(SESSION_COOKIE, await signToken({ uid: u.id, kind: 'session' }, THIRTY_DAYS), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS });
  return res;
}
