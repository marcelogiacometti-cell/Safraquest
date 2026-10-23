import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/web';
export default async function Home() {
  const u = await currentUser();
  if (!u) redirect('/entrar');
  redirect(u.role === 'REPRESENTANTE' ? '/rep' : ['MARKETING', 'DIRETORIA', 'REGIONAL'].includes(u.role) ? '/painel' : '/app');
}
