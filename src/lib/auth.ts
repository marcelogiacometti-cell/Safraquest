import bcrypt from 'bcryptjs';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hmac, randomCode, safeEqual } from './crypto';
import { normalizeEmail } from './mail';
import { getProvider, contactOf } from './whatsapp/provider';
import { env } from './env';

export const CODE_TTL_MIN = 10;
export const MAX_ATTEMPTS = 3;
export const MAX_CODES_PER_15MIN = 3;

export type RequestCodeResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'INVALID_EMAIL' | 'NOT_FOUND' | 'PENDING' | 'INACTIVE' | 'RATE_LIMIT' | 'SEND_FAILED' };

const codeHash = (userId: string, code: string) => hmac(`${userId}:${code}`);

export async function requestLoginCode(rawEmail: string): Promise<RequestCodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: 'INVALID_EMAIL' };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!u) return { ok: false, reason: 'NOT_FOUND' };
  if (u.status === 'PENDING') return { ok: false, reason: 'PENDING' };
  if (u.status !== 'ACTIVE') return { ok: false, reason: 'INACTIVE' };
  if (!['VENDEDOR', 'REPRESENTANTE', 'GESTOR'].includes(u.role)) return { ok: false, reason: 'INACTIVE' };

  const since = new Date(Date.now() - 15 * 60_000);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.loginCodes)
    .where(and(eq(schema.loginCodes.userId, u.id), gt(schema.loginCodes.createdAt, since)));
  if (n >= MAX_CODES_PER_15MIN) return { ok: false, reason: 'RATE_LIMIT' };

  const code = randomCode();
  await db.insert(schema.loginCodes).values({ userId: u.id, codeHash: codeHash(u.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000) });
  const provider = await getProvider();
  const to = contactOf(u);
  if (!to) return { ok: false, reason: 'SEND_FAILED' };
  const sent = await provider.sendTemplate(to, 'codigo_acesso', [code], { urlButton: code });
  if (!sent.ok) return { ok: false, reason: 'SEND_FAILED' };
  return { ok: true, email };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'NO_CODE' | 'EXPIRED' | 'WRONG' | 'TOO_MANY'; attemptsLeft?: number };

export async function verifyLoginCode(rawEmail: string, code: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: 'NO_CODE' };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!u || u.status !== 'ACTIVE') return { ok: false, reason: 'NO_CODE' };
  const [row] = await db.select().from(schema.loginCodes)
    .where(and(eq(schema.loginCodes.userId, u.id), sql`${schema.loginCodes.usedAt} is null`))
    .orderBy(desc(schema.loginCodes.createdAt)).limit(1);
  if (!row) return { ok: false, reason: 'NO_CODE' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY' };
  if (!safeEqual(row.codeHash, codeHash(u.id, code.trim()))) {
    await db.update(schema.loginCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.loginCodes.id, row.id));
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return left <= 0 ? { ok: false, reason: 'TOO_MANY' } : { ok: false, reason: 'WRONG', attemptsLeft: left };
  }
  await db.update(schema.loginCodes).set({ usedAt: new Date() }).where(eq(schema.loginCodes.id, row.id));
  return { ok: true, userId: u.id };
}

const PANEL_ROLES = ['MARKETING', 'DIRETORIA', 'REGIONAL', 'GESTOR', 'REPRESENTANTE'] as const;

export async function panelLogin(email: string, password: string): Promise<{ ok: true; userId: string } | { ok: false }> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  // compara sempre, para não revelar se o e-mail existe pelo tempo de resposta
  const hash = u?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const okPw = await bcrypt.compare(password, hash);
  if (!u || !okPw || u.status !== 'ACTIVE' || !(PANEL_ROLES as readonly string[]).includes(u.role)) return { ok: false };
  return { ok: true, userId: u.id };
}

export function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }

/** Link semanal que já entra logado (vale até a missão fechar). */
export function magicLinkPath(token: string) { return `${env.appUrl}/l/${token}`; }

// ---------------------------------------------------------------- cadastro por convite

export type InviteCheck =
  | { ok: true; invite: typeof schema.inviteLinks.$inferSelect }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'FULL' };

export async function checkInvite(token: string): Promise<InviteCheck> {
  const [inv] = await db.select().from(schema.inviteLinks).where(eq(schema.inviteLinks.token, token));
  if (!inv) return { ok: false, reason: 'NOT_FOUND' };
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return { ok: false, reason: 'FULL' };
  return { ok: true, invite: inv };
}

export type RegisterInput = { token: string; name: string; email: string; unitId?: string | null; consent: boolean; password?: string };
export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'INVITE' | 'NAME' | 'CONSENT' | 'DUPLICATE' | 'UNIT' | 'EMAIL' | 'PASSWORD'; invite?: 'NOT_FOUND' | 'EXPIRED' | 'FULL' };

export async function registerViaInvite(input: RegisterInput): Promise<RegisterResult> {
  const chk = await checkInvite(input.token);
  if (!chk.ok) return { ok: false, reason: 'INVITE', invite: chk.reason };
  const inv = chk.invite;
  if (input.name.trim().split(/\s+/).length < 2) return { ok: false, reason: 'NAME' };
  const email = normalizeEmail(input.email ?? '');
  if (!email) return { ok: false, reason: 'EMAIL' };
  const isGestor = inv.targetRole === 'GESTOR';
  if (!isGestor && !input.consent) return { ok: false, reason: 'CONSENT' };
  let passwordHash: string | null = null;
  if (isGestor) {
    if ((input.password ?? '').length < 8) return { ok: false, reason: 'PASSWORD' };
    passwordHash = await hashPassword(input.password!);
  }
  let unitId = inv.unitId ?? input.unitId ?? null;
  if (unitId && inv.distributorId) {
    const [un] = await db.select().from(schema.units).where(and(eq(schema.units.id, unitId), eq(schema.units.distributorId, inv.distributorId)));
    if (!un) return { ok: false, reason: 'UNIT' };
  }
  if (inv.targetRole === 'VENDEDOR' && !unitId) return { ok: false, reason: 'UNIT' };
  const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (dup) return { ok: false, reason: 'DUPLICATE' };
  const now = new Date();
  const created = await db.transaction(async (tx) => {
    // reserva a vaga no link de forma atômica, para respeitar o limite de cadastros
    const upd = await tx.update(schema.inviteLinks).set({ uses: sql`${schema.inviteLinks.uses} + 1` })
      .where(and(eq(schema.inviteLinks.id, inv.id), sql`(${schema.inviteLinks.maxUses} is null or ${schema.inviteLinks.uses} < ${schema.inviteLinks.maxUses})`))
      .returning({ id: schema.inviteLinks.id });
    if (!upd.length) return null;
    const [u] = await tx.insert(schema.users).values({
      name: input.name.trim(), email, passwordHash, role: inv.targetRole, status: 'PENDING',
      distributorId: inv.distributorId, unitId, invitedVia: inv.id,
      consentAt: input.consent ? now : null, notifyOptIn: input.consent,
    }).returning({ id: schema.users.id });
    if (input.consent) await tx.insert(schema.consentLogs).values({ userId: u.id, kind: 'GRANT', source: 'cadastro:' + inv.id });
    return u;
  });
  if (!created) return { ok: false, reason: 'INVITE', invite: 'FULL' };
  return { ok: true, userId: created.id };
}
