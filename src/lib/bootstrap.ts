import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashPassword } from './auth';

export const TEMPLATES = [
  { name: 'abertura_missao_semanal', category: 'UTILITY', usedIn: 'Abertura da missão', body: 'Olá, {{1}}! A missão da semana sobre {{2}} já está aberta. Responda aqui: {{3}}' },
  { name: 'lembrete_missao', category: 'UTILITY', usedIn: 'Lembrete de quarta', body: 'Oi, {{1}}! Sua missão sobre {{2}} está esperando. São 4 minutos: {{3}}' },
  { name: 'ultimo_aviso_missao', category: 'UTILITY', usedIn: 'Último aviso', body: 'Última chance, {{1}}! A missão sobre {{2}} encerra hoje às 23h59: {{3}}' },
  { name: 'resultado_ranking', category: 'UTILITY', usedIn: 'Resultado e ranking', body: '{{1}}, saiu o resultado da missão. Veja sua posição: {{2}}' },
  { name: 'codigo_acesso', category: 'AUTHENTICATION', usedIn: 'Login por código', body: '{{1}} é o seu código de verificação do SafraQuest.' },
  { name: 'cadastro_aprovado', category: 'UTILITY', usedIn: 'Cadastro aprovado', body: '{{1}}, seu cadastro foi aprovado! Entre aqui: {{2}}' },
  { name: 'aviso_correcao', category: 'UTILITY', usedIn: 'Correção de pergunta', body: '{{1}}, {{2}}' },
  { name: 'vencedores_campanha', category: 'UTILITY', usedIn: 'Vencedores da campanha', body: '{{1}}, saíram os vencedores da campanha! Veja no app.' },
];

export async function bootstrap(opts: { adminEmail?: string; adminPassword?: string; adminName?: string; approveAllTemplates?: boolean } = {}) {
  for (const name of ['Sul', 'Norte']) await db.insert(schema.regionals).values({ name }).onConflictDoNothing();
  for (const t of TEMPLATES) {
    await db.insert(schema.waTemplates).values({ ...t, status: opts.approveAllTemplates ? 'APPROVED' : 'IN_REVIEW' })
      .onConflictDoUpdate({ target: schema.waTemplates.name, set: { usedIn: t.usedIn, body: t.body, category: t.category } });
  }
  await db.insert(schema.waConfig).values({ id: 1 }).onConflictDoNothing();
  let adminId: string | null = null;
  if (opts.adminEmail && opts.adminPassword) {
    const email = opts.adminEmail.toLowerCase();
    const [ex] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (ex) adminId = ex.id;
    else {
      const [u] = await db.insert(schema.users).values({
        name: opts.adminName ?? 'Marketing', email, passwordHash: await hashPassword(opts.adminPassword), role: 'MARKETING', status: 'ACTIVE', approvedAt: new Date(),
      }).returning();
      adminId = u.id;
    }
  }
  return { adminId };
}

export async function resetAll() {
  await db.execute(sql`truncate table ${sql.raw(['closures', 'user_badges', 'question_reports', 'message_logs', 'message_moments', 'answers', 'attempts', 'questions', 'missions', 'campaign_groups', 'campaigns', 'channel_group_members', 'channel_groups', 'consent_logs', 'login_codes', 'invite_links', 'rep_assignments', 'users', 'units', 'distributors', 'regionals', 'wa_templates', 'wa_config'].join(', '))} restart identity cascade`);
}
