import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { bootstrap, resetAll } from './bootstrap';
import { hashPassword } from './auth';
import type { Actor } from './access';

export async function freshWorld() {
  await resetAll();
  await bootstrap({ approveAllTemplates: true });
  const [sul] = await db.select().from(schema.regionals).where(eq(schema.regionals.name, 'Sul'));
  const [norte] = await db.select().from(schema.regionals).where(eq(schema.regionals.name, 'Norte'));
  const mk = async (name: string, type: 'COOPERATIVA' | 'REVENDA', regionalId: string, units: string[]) => {
    const [d] = await db.insert(schema.distributors).values({ name, type, regionalId }).returning();
    const us = [];
    for (const u of units) { const [x] = await db.insert(schema.units).values({ distributorId: d.id, name: u }).returning(); us.push(x); }
    return { d, us };
  };
  const alfa = await mk('Cooperativa Alfa', 'COOPERATIVA', sul.id, ['Matriz']);
  const beta = await mk('Revenda Beta', 'REVENDA', sul.id, ['Filial Centro', 'Filial Norte']);
  const kappa = await mk('Revenda Kappa', 'REVENDA', norte.id, ['Loja 1']);
  const [marketing] = await db.insert(schema.users).values({ name: 'Marcelo Giacometti', email: 'mkt@corteva.test', passwordHash: await hashPassword('senha-forte-123'), role: 'MARKETING', status: 'ACTIVE' }).returning();
  const [gestor] = await db.insert(schema.users).values({ name: 'Renata Lopes', email: 'renata@beta.test', passwordHash: await hashPassword('senha-forte-123'), whatsapp: '5554911110000', role: 'GESTOR', status: 'ACTIVE', distributorId: beta.d.id, consentAt: new Date() }).returning();
  const actor = (u: typeof marketing): Actor => ({ id: u.id, role: u.role as Actor['role'], distributorId: u.distributorId, unitId: u.unitId, regionalId: u.regionalId });
  return { sul, norte, alfa, beta, kappa, marketing, gestor, actor };
}

let n = 0;
export async function addSeller(distributorId: string, unitId: string, name: string, status: 'ACTIVE' | 'PENDING' = 'ACTIVE') {
  n++;
  const [u] = await db.insert(schema.users).values({
    name, whatsapp: '55549' + String(80000000 + n), role: 'VENDEDOR', status, distributorId, unitId, consentAt: new Date(),
  }).returning();
  return u;
}
