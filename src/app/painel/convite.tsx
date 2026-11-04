import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Actor } from '@/lib/access';
import { visibleDistributorIds } from '@/lib/access';
import { Form } from '@/app/forms';
import { gerarConvite } from './actions';

/** Gerador de link de cadastro (Marketing e gestores). */
export async function ConviteCard({ actor, role }: { actor: Actor; role: string }) {
  const vis = await visibleDistributorIds(actor);
  const units = actor.distributorId ? await db.select().from(schema.units).where(eq(schema.units.distributorId, actor.distributorId)) : [];
  const dists = actor.distributorId ? [] : (await db.select().from(schema.distributors)).filter((d) => !vis || vis.includes(d.id));
  const user = { role };
  return (<>
    <div className="card"><h2>Link de cadastro</h2>
      <Form action={gerarConvite} submit="Gerar link">
        {user.role === 'MARKETING'
          ? <label>Quem vai se cadastrar<select name="papel" defaultValue="VENDEDOR"><option value="VENDEDOR">Vendedor</option><option value="MARKETING">Marketing (acesso total)</option><option value="GESTOR">Gestor de distribuidor</option><option value="REPRESENTANTE">Representante Corteva</option></select></label>
          : <input type="hidden" name="papel" value="VENDEDOR" />}
        {actor.distributorId ? <input type="hidden" name="dist" value={actor.distributorId} /> : <label>Distribuidor<select name="dist" defaultValue=""><option value="">(não se aplica ao representante)</option>{dists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
        {units.length > 0 && <label>Unidade<select name="unidade" defaultValue=""><option value="">Vendedor escolhe</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        <label>Validade (dias)<input name="dias" type="number" defaultValue={7} min={1} max={90} /></label>
        <label>Máximo de cadastros (opcional)<input name="usos" type="number" min={1} /></label>
      </Form></div>
  </>);
}
