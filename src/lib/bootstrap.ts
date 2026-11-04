import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashPassword } from './auth';
import { TEMPLATES } from './templates';

export { TEMPLATES };
export const REGIONAIS = ['Centro Sul', 'Sul+PY', 'Oeste Venda Direta', 'Oeste Venda Indireta', 'Especialidades', 'Pastagem'];

export async function bootstrap(opts: { adminEmail?: string; adminPassword?: string; adminName?: string; approveAllTemplates?: boolean } = {}) {
  for (const name of REGIONAIS) await db.insert(schema.regionals).values({ name }).onConflictDoNothing();
  // remove as regionais de exemplo antigas, se ninguém as usa
  for (const old of ['Sul', 'Norte']) {
    const [r] = await db.select().from(schema.regionals).where(eq(schema.regionals.name, old));
    if (!r) continue;
    const [d] = await db.select({ id: schema.distributors.id }).from(schema.distributors).where(eq(schema.distributors.regionalId, r.id)).limit(1);
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.regionalId, r.id)).limit(1);
    const [g] = await db.select({ id: schema.channelGroups.id }).from(schema.channelGroups).where(eq(schema.channelGroups.regionalId, r.id)).limit(1);
    if (!d && !u && !g) await db.delete(schema.regionals).where(eq(schema.regionals.id, r.id));
  }
  for (const t of TEMPLATES) {
    await db.insert(schema.waTemplates).values({ ...t, status: opts.approveAllTemplates ? 'APPROVED' : 'IN_REVIEW' })
      .onConflictDoUpdate({ target: schema.waTemplates.name, set: { usedIn: t.usedIn, body: t.body, category: t.category, ...(opts.approveAllTemplates ? { status: 'APPROVED' as const } : {}) } });
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
