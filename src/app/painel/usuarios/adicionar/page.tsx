import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { visibleDistributorIds } from '@/lib/access';
import { Form } from '@/app/forms';
import { criarUsuario } from '../../actions';
import { ConviteCard } from '../../convite';
import { RoleFields } from '../campos';
export const dynamic = 'force-dynamic';
export default async function Adicionar() {
  const { user: me, actor } = await requirePanel(['MARKETING', 'GESTOR']);
  const vis = await visibleDistributorIds(actor);
  const dists = (await db.select().from(schema.distributors)).filter((d) => vis === null || vis.includes(d.id)).map((d) => ({ id: d.id, name: d.name, regionalId: d.regionalId }));
  const units = (await db.select().from(schema.units)).filter((u) => dists.some((d) => d.id === u.distributorId)).map((u) => ({ id: u.id, name: u.name, distributorId: u.distributorId }));
  const mkt = me.role === 'MARKETING';
  const tree = mkt ? (await db.select().from(schema.users)).filter((u) => u.role === 'REPRESENTANTE' && u.diretoria && u.distrito && u.territorio).map((u) => ({ diretoria: u.diretoria!, distrito: u.distrito!, territorio: u.territorio! })) : [];
  return (<><h1>Adicionar usuários</h1>
    <div className="card"><h2>Cadastrar manualmente</h2>
      <p className="mu">A pessoa entra já aprovada e acessa com o e-mail cadastrado.</p>
      <Form action={criarUsuario} submit="Cadastrar usuário">
        <label>Nome<input name="nome" required /></label>
        <label>E-mail<input name="email" type="email" required /></label>
        <RoleFields roles={mkt ? ['VENDEDOR', 'GESTOR', 'REPRESENTANTE', 'MARKETING'] : ['VENDEDOR']} dists={dists} units={units} fixedDist={mkt ? undefined : actor.distributorId ?? undefined} tree={tree} />
        <label style={{ fontWeight: 400, display: 'block', margin: '6px 0 12px' }}><input type="checkbox" name="consent" style={{ width: 'auto' }} /> A pessoa autorizou receber os avisos por e-mail</label></Form></div>
    <ConviteCard actor={actor} role={me.role} /></>);
}
