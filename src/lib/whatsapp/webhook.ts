import { and, eq, sql } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db, schema } from '@/db';
import { decrypt, safeEqual } from '../crypto';
import { normalizePhone } from '../phone';
import { getConfig, getProvider } from './provider';

export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(expected, header.slice(7));
}

export async function verifyChallenge(params: URLSearchParams): Promise<string | null> {
  const cfg = await getConfig();
  if (params.get('hub.mode') === 'subscribe' && cfg?.verifyToken && params.get('hub.verify_token') === cfg.verifyToken) {
    return params.get('hub.challenge');
  }
  return null;
}

const STATUS_MAP: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
const RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 9, SKIPPED: 0 } as const;

type WebhookBody = {
  entry?: { changes?: { value?: {
    statuses?: { id: string; status: string; errors?: { code?: number; title?: string }[] }[];
    messages?: { from: string; type: string; text?: { body: string } }[];
  } }[] }[];
};

export const OPT_OUT_WORDS = ['SAIR', 'PARAR', 'STOP', 'CANCELAR'];

export async function handleWebhook(body: WebhookBody) {
  await db.update(schema.waConfig).set({ lastWebhookAt: new Date() }).where(eq(schema.waConfig.id, 1));
  let statuses = 0; let optOuts = 0; let replies = 0;
  for (const e of body.entry ?? []) {
    for (const ch of e.changes ?? []) {
      for (const st of ch.value?.statuses ?? []) {
        const mapped = STATUS_MAP[st.status];
        if (!mapped) continue;
        const [row] = await db.select().from(schema.messageLogs).where(eq(schema.messageLogs.waMessageId, st.id));
        if (!row) continue;
        if (RANK[mapped] < RANK[row.status] && mapped !== 'FAILED') continue; // não regride (entregue depois de lido)
        await db.update(schema.messageLogs).set({
          status: mapped,
          error: mapped === 'FAILED' ? (st.errors?.[0]?.title ?? 'falha informada pela Meta') : row.error,
        }).where(eq(schema.messageLogs.id, row.id));
        statuses++;
      }
      for (const m of ch.value?.messages ?? []) {
        const phone = normalizePhone(m.from.replace(/^\+/, '')) ?? m.from;
        const [u] = await db.select().from(schema.users).where(eq(schema.users.whatsapp, phone));
        const text = (m.text?.body ?? '').trim().toUpperCase();
        if (u && m.type === 'text' && OPT_OUT_WORDS.includes(text)) {
          await optOut(u.id, 'whatsapp:' + text);
          optOuts++;
          const p = await getProvider();
          await p.sendText(m.from, 'Pronto, você não vai mais receber os avisos do SafraQuest. Para voltar, fale com o seu gestor.');
        } else {
          const cfg = await getConfig();
          if (cfg?.autoReply) { const p = await getProvider(); await p.sendText(m.from, cfg.autoReply); replies++; }
        }
      }
    }
  }
  return { statuses, optOuts, replies };
}

export async function optOut(userId: string, source: string) {
  const now = new Date();
  await db.update(schema.users).set({ optOutAt: now, notifyOptIn: false }).where(eq(schema.users.id, userId));
  await db.insert(schema.consentLogs).values({ userId, kind: 'REVOKE', source });
}

export async function optIn(userId: string, source: string, text?: string) {
  await db.update(schema.users).set({ optOutAt: null, notifyOptIn: true, consentAt: new Date() }).where(eq(schema.users.id, userId));
  await db.insert(schema.consentLogs).values({ userId, kind: 'GRANT', source, text });
}

export async function appSecret(): Promise<string | null> {
  const c = await getConfig();
  return c?.appSecretEnc ? decrypt(c.appSecretEnc) : null;
}
export { and, sql };
