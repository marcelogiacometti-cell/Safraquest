import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { decrypt } from '../crypto';
import { env } from '../env';

export type SendResult = { ok: true; id: string } | { ok: false; error: string };
export type TemplateParam = string;

export interface WaProvider {
  sendTemplate(to: string, template: string, params: TemplateParam[], opts?: { lang?: string; urlButton?: string }): Promise<SendResult>;
  sendText(to: string, body: string): Promise<SendResult>;
  listTemplates(): Promise<{ name: string; category: string; lang: string; status: string }[]>;
  qualityRating(): Promise<string>;
}

/** Provedor de desenvolvimento: não envia nada, só guarda para conferência. */
export const consoleOutbox: { to: string; template?: string; params?: string[]; text?: string }[] = [];

export class ConsoleProvider implements WaProvider {
  async sendTemplate(to: string, template: string, params: string[]): Promise<SendResult> {
    consoleOutbox.push({ to, template, params });
    if (process.env.NODE_ENV !== 'test') console.log(`[whatsapp:console] ${to} ← ${template}`, params);
    return { ok: true, id: 'console-' + Math.random().toString(36).slice(2) };
  }
  async sendText(to: string, body: string): Promise<SendResult> {
    consoleOutbox.push({ to, text: body });
    return { ok: true, id: 'console-' + Math.random().toString(36).slice(2) };
  }
  async listTemplates() { return []; }
  async qualityRating() { return 'GREEN'; }
}

type Cfg = { wabaId: string; phoneNumberId: string; token: string };

export class MetaProvider implements WaProvider {
  constructor(private cfg: Cfg, private fetchImpl: typeof fetch = fetch) {}

  private base() { return `https://graph.facebook.com/${env.graphVersion}`; }

  private async post(path: string, body: unknown): Promise<SendResult> {
    try {
      const res = await this.fetchImpl(`${this.base()}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
      if (!res.ok) return { ok: false, error: `${json.error?.code ?? res.status}: ${json.error?.message ?? 'erro desconhecido'}` };
      const id = json.messages?.[0]?.id;
      return id ? { ok: true, id } : { ok: false, error: 'resposta sem id de mensagem' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'falha de rede' };
    }
  }

  sendTemplate(to: string, template: string, params: string[], opts?: { lang?: string; urlButton?: string }) {
    const components: unknown[] = [];
    if (params.length) components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) });
    if (opts?.urlButton) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: opts.urlButton }] });
    return this.post(`${this.cfg.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: template, language: { code: opts?.lang ?? 'pt_BR' }, components },
    });
  }

  sendText(to: string, body: string) {
    return this.post(`${this.cfg.phoneNumberId}/messages`, { messaging_product: 'whatsapp', to, type: 'text', text: { body } });
  }

  async listTemplates() {
    const res = await this.fetchImpl(`${this.base()}/${this.cfg.wabaId}/message_templates?fields=name,category,language,status&limit=100`, {
      headers: { Authorization: `Bearer ${this.cfg.token}` },
    });
    if (!res.ok) throw new Error(`Meta respondeu ${res.status}`);
    const json = (await res.json()) as { data: { name: string; category: string; language: string; status: string }[] };
    return json.data.map((t) => ({ name: t.name, category: t.category, lang: t.language, status: t.status }));
  }

  async qualityRating() {
    const res = await this.fetchImpl(`${this.base()}/${this.cfg.phoneNumberId}?fields=quality_rating`, {
      headers: { Authorization: `Bearer ${this.cfg.token}` },
    });
    if (!res.ok) throw new Error(`Meta respondeu ${res.status}`);
    const json = (await res.json()) as { quality_rating?: string };
    return json.quality_rating ?? 'UNKNOWN';
  }
}

let override: WaProvider | null = null;
export function setProviderForTests(p: WaProvider | null) { override = p; }

export async function getConfig() {
  const rows = await db.select().from(schema.waConfig).where(eq(schema.waConfig.id, 1));
  return rows[0] ?? null;
}

export async function getProvider(): Promise<WaProvider> {
  if (override) return override;
  if (env.waProvider === 'meta') {
    const c = await getConfig();
    if (!c?.wabaId || !c.phoneNumberId || !c.tokenEnc) throw new Error('Integração com a Meta incompleta. Preencha em Integração.');
    return new MetaProvider({ wabaId: c.wabaId, phoneNumberId: c.phoneNumberId, token: decrypt(c.tokenEnc) });
  }
  return new ConsoleProvider();
}

export function mapTemplateStatus(s: string): 'APPROVED' | 'IN_REVIEW' | 'REJECTED' {
  if (s === 'APPROVED') return 'APPROVED';
  if (s === 'REJECTED' || s === 'DISABLED' || s === 'PAUSED') return 'REJECTED';
  return 'IN_REVIEW';
}
