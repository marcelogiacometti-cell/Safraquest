import { requireMember } from '@/lib/web';
import { badgesOf } from '@/lib/quiz';
import { Form } from '@/app/forms';
import { pausar, sairPrograma, sair } from '@/app/actions';
export const dynamic = 'force-dynamic';
export default async function Perfil() {
  const u = await requireMember(); const badges = await badgesOf(u.id);
  return (<><h1>{u.name}</h1><p className="mu">{u.email}</p>
    <div className="card"><h2>Conquistas</h2>{badges.map((b) => <p key={b.key} style={{ opacity: b.earned ? 1 : 0.4 }}>{b.earned ? '🏅' : '🔒'} <b>{b.label}</b> <span className="mu">{b.hint}</span></p>)}</div>
    <div className="card"><h2>Pausar avisos</h2><Form action={pausar} submit="Pausar"><select name="dias" defaultValue="7"><option value="7">7 dias</option><option value="14">14 dias</option><option value="30">30 dias</option></select></Form></div>
    <form action={sair}><button className="btn sec block">Sair deste aparelho</button></form>
    <form action={sairPrograma} style={{ marginTop: 12 }}><button className="btn dng block">Sair do programa</button></form>
    <p className="mu">Ao sair do programa você para de receber mensagens. Seus pontos ficam guardados.</p></>);
}
