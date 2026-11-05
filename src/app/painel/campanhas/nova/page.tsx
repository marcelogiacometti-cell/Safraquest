import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { loadCampaignPlan, type CampaignPlanInput } from '@/lib/admin';
import { Builder } from './builder';
export const dynamic = 'force-dynamic';
export default async function Nova({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requirePanel(['MARKETING']); const sp = await searchParams;
  const groups = (await db.select().from(schema.channelGroups)).map((g) => ({ id: g.id, name: g.name }));
  const draft = sp.id ? await loadCampaignPlan(sp.id) : null;
  const initial: CampaignPlanInput = draft && draft.campaign.status === 'DRAFT' ? draft.plan : { name: '', productName: '', objective: '', materialUrl: '', speedBonus: false, groupIds: [], questions: [] };
  return (<><h1>{draft ? 'Editar rascunho' : 'Nova campanha'}</h1>
    <Builder groups={groups} initial={initial} campaignId={draft && draft.campaign.status === 'DRAFT' ? draft.campaign.id : null} /></>);
}
