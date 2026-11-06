import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { loadCampaignPlan, type CampaignPlanInput } from '@/lib/admin';
import { Builder } from './builder';
export const dynamic = 'force-dynamic';
export default async function Nova({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requirePanel(['MARKETING']); const sp = await searchParams;
  const regionals = (await db.select().from(schema.regionals)).map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const sellers = await db.select({ d: schema.users.distributorId }).from(schema.users).where(and(eq(schema.users.role, 'VENDEDOR'), eq(schema.users.status, 'ACTIVE')));
  const dists = (await db.select().from(schema.distributors)).filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, type: d.type as 'COOPERATIVA' | 'REVENDA', regionalId: d.regionalId, sellers: sellers.filter((x) => x.d === d.id).length })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const reps = (await db.select().from(schema.users)).filter((u) => u.role === 'REPRESENTANTE' && u.status === 'ACTIVE').map((u) => ({ id: u.id, name: u.name, diretoria: u.diretoria ?? '', distrito: u.distrito ?? '', territorio: u.territorio ?? '' })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const draft = sp.id ? await loadCampaignPlan(sp.id) : null;
  const initial: CampaignPlanInput = draft && draft.campaign.status === 'DRAFT' ? draft.plan : { name: '', productName: '', objective: '', materialUrl: '', speedBonus: false, audience: { regionalIds: [], types: [], distributorIds: [], diretorias: [], distritos: [], territorios: [], repIds: [] }, questions: [] };
  return (<><h1>{draft ? 'Editar rascunho' : 'Nova campanha'}</h1>
    <Builder regionals={regionals} dists={dists} reps={reps} initial={initial} campaignId={draft && draft.campaign.status === 'DRAFT' ? draft.campaign.id : null} /></>);
}
