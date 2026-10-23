'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buscarPergunta, responder } from '../../../actions';

type Q = { attemptId: string; position: number; total: number; secondsLeft: number; timeLimit: number; question: { id: string; text: string; options: string[]; topic: string; product: string } };
type FB = { correct: boolean; correctIndex: number; explanation: string | null; points: number; timedOut: boolean; finished: boolean };

export default function Quiz({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [q, setQ] = useState<Q | null>(null);
  const [fb, setFb] = useState<FB | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState('');
  const busy = useRef(false);

  async function load() {
    const r = await buscarPergunta(missionId) as Q & { finished?: boolean; error?: string };
    if (r.error) { setErr(r.error); return; }
    if (r.finished) { router.replace(`/app/resultado/${missionId}`); return; }
    setQ(r); setFb(null); setPicked(null); setLeft(r.secondsLeft); busy.current = false;
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!q || fb) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [q, fb]);
  useEffect(() => { if (q && !fb && left === 0) send(-1); /* eslint-disable-next-line */ }, [left]);

  async function send(i: number) {
    if (!q || busy.current) return; busy.current = true; setPicked(i);
    const r = await responder(missionId, q.question.id, i) as FB & { error?: string };
    if (r.error) { setErr(r.error); return; }
    setFb(r);
  }
  if (err) return <div className="err">{err} <a href="/app">Voltar</a></div>;
  if (!q) return <p className="mu">Carregando…</p>;
  return (<div>
    <div className="row"><span className="mu">Pergunta {q.position} de {q.total}</span><span className={'pill' + (left <= 5 ? ' rd' : '')}>⏱ {left}s</span></div>
    <div className="bar" style={{ margin: '8px 0 16px' }}><i style={{ width: `${(q.position - (fb ? 0 : 1)) / q.total * 100}%` }} /></div>
    <span className="pill">{q.question.topic}</span>
    <h1 style={{ fontSize: 20 }}>{q.question.text}</h1>
    {q.question.options.map((o, i) => {
      const cls = fb ? (i === fb.correctIndex ? 'right' : i === picked ? 'wrong' : '') : '';
      return <button key={i} className={`opt ${cls}`} disabled={!!fb || busy.current} onClick={() => send(i)}>{String.fromCharCode(65 + i)}. {o}</button>;
    })}
    {fb && <div className={fb.correct ? 'ok' : 'err'}>
      <b>{fb.timedOut ? 'Tempo esgotado.' : fb.correct ? `Acertou! +${fb.points} pts` : 'Não foi dessa vez.'}</b>
      {fb.explanation && <p style={{ margin: '6px 0 0' }}>{fb.explanation}</p>}
    </div>}
    {fb && <button className="btn block" onClick={() => fb.finished ? router.replace(`/app/resultado/${missionId}`) : load()}>{fb.finished ? 'Ver resultado' : 'Próxima'}</button>}
  </div>);
}
