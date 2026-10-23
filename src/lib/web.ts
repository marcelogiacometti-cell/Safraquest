import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { readToken, signToken, SESSION_COOKIE, THIRTY_DAYS, TWELVE_HOURS } from './session';
import { loadActor, PANEL_ROLES, type Actor } from './access';

export async function setSession(userId: string, role: string) {
  const ttl = PANEL_ROLES.includes(role as never) ? TWELVE_HOURS : THIRTY_DAYS;
  const token = await signToken({ uid: userId, kind: 'session' }, ttl);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: ttl });
}
export async function clearSession() { (await cookies()).delete(SESSION_COOKIE); }

export async function currentUser() {
  const p = await readToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!p || p.kind !== 'session') return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, p.uid));
  if (!u || u.status !== 'ACTIVE') return null;
  return u;
}
/** Vendedor ou representante (área do app). */
export async function requireMember() {
  const u = await currentUser();
  if (!u || !['VENDEDOR', 'REPRESENTANTE', 'GESTOR'].includes(u.role)) redirect('/entrar');
  return u;
}
export async function requirePanel(roles?: string[]): Promise<{ user: NonNullable<Awaited<ReturnType<typeof currentUser>>>; actor: Actor }> {
  const u = await currentUser();
  if (!u || !PANEL_ROLES.includes(u.role as never) || (roles && !roles.includes(u.role))) redirect('/painel/login');
  const actor = (await loadActor(u.id))!;
  return { user: u, actor };
}
export const fmtDate = (d: Date | string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
export const firstName = (n: string) => n.split(' ')[0];
