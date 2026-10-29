import nodemailer from 'nodemailer';
import { hmac, safeEqual } from './crypto';
import { env } from './env';
import { TEMPLATES } from './templates';
import type { SendResult, WaProvider } from './whatsapp/provider';

export const SUBJECTS: Record<string, string> = {
  abertura_missao_semanal: 'Sua missão da semana no SafraQuest já abriu',
  lembrete_missao: 'Sua missão do SafraQuest está esperando',
  ultimo_aviso_missao: 'Última chance: a missão do SafraQuest encerra hoje',
  resultado_ranking: 'Saiu o resultado da missão do SafraQuest',
  codigo_acesso: 'Seu código de acesso ao SafraQuest',
  cadastro_aprovado: 'Seu cadastro no SafraQuest foi aprovado',
  aviso_correcao: 'Aviso sobre as perguntas do SafraQuest',
  vencedores_campanha: 'Saíram os vencedores da campanha do SafraQuest',
};
const BODY_OVERRIDE: Record<string, string> = {
  codigo_acesso: 'Seu código de acesso ao SafraQuest é {{1}}. Ele vale por 10 minutos. Se não foi você, ignore este e-mail.',
};

export const normalizeEmail = (raw: string) => {
  const e = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
};
export const unsubSig = (email: string) => hmac('unsub:' + email);
export const verifyUnsub = (email: string, sig: string) => safeEqual(unsubSig(email), sig);
export const unsubUrl = (email: string) => `${env.appUrl}/sair?e=${encodeURIComponent(email)}&s=${unsubSig(email)}`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isUrl = (s: string) => /^https?:\/\//.test(s);

export function renderMail(template: string, params: string[], to: string) {
  const body = BODY_OVERRIDE[template] ?? TEMPLATES.find((t) => t.name === template)?.body ?? params.join(' ');
  const fill = (fn: (p: string) => string) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => fn(params[Number(n) - 1] ?? ''));
  const subject = SUBJECTS[template] ?? 'SafraQuest';
  const footer = template === 'codigo_acesso' ? '' : `Para não receber mais e-mails do SafraQuest: ${unsubUrl(to)}`;
  const text = fill((p) => p) + (footer ? `\n\n${footer}` : '');
  const link = params.find(isUrl);
  const html = fill((p) => (isUrl(p) ? `<a href="${esc(p)}" style="color:#1E7B4F">${esc(p)}</a>` : template === 'codigo_acesso' ? `<b style="font-size:22px;letter-spacing:3px">${esc(p)}</b>` : esc(p)));
  const button = link && template !== 'cadastro_aprovado' ? `<p style="margin:24px 0"><a href="${esc(link)}" style="background:#1E7B4F;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Abrir o SafraQuest</a></p>` : link ? `<p style="margin:24px 0"><a href="${esc(link)}" style="background:#1E7B4F;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Entrar</a></p>` : '';
  const foot = footer ? `<p style="color:#5b6b60;font-size:12px;margin-top:28px">Você recebe este e-mail por participar do SafraQuest. <a href="${esc(unsubUrl(to))}" style="color:#5b6b60">Parar de receber</a></p>` : '';
  return { subject, text, html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#12261C"><h2 style="color:#1E7B4F;margin:0 0 16px">🌱 SafraQuest</h2><p style="font-size:16px;line-height:1.5">${html}</p>${button}${foot}</div>` };
}

export class MailProvider implements WaProvider {
  private t = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  private from = process.env.MAIL_FROM || process.env.SMTP_USER || 'SafraQuest <no-reply@localhost>';
  private async send(to: string, subject: string, text: string, html: string, unsub: boolean): Promise<SendResult> {
    try {
      const info = await this.t.sendMail({ from: this.from, to, subject, text, html, ...(unsub ? { headers: { 'List-Unsubscribe': `<${unsubUrl(to)}>` } } : {}) });
      return { ok: true, id: String(info.messageId ?? '') };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'falha no envio' }; }
  }
  sendTemplate(to: string, template: string, params: string[]) {
    const m = renderMail(template, params, to);
    return this.send(to, m.subject, m.text, m.html, template !== 'codigo_acesso');
  }
  sendText(to: string, body: string) { return this.send(to, 'SafraQuest', body, `<p>${esc(body)}</p>`, false); }
  async listTemplates() { return []; }
  async qualityRating() { return 'GREEN'; }
}
