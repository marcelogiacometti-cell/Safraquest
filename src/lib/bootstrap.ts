import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashPassword } from './auth';
import { TEMPLATES } from './templates';

export { TEMPLATES };

export async function bootstrap(opts: { adminEmail?: string; adminPassword?: string; adminName?: string; approveAllTemplates?: boolean } = {}) {
  for (const name of ['Sul', 'Norte']) await db.insert(schema.regionals).values({ name }).onConflictDoNothing();
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
