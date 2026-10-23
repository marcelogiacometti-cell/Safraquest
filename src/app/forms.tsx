'use client';
import { useActionState, useEffect, useRef } from 'react';
type R = { error?: string; ok?: string } | void;
type A = (s: unknown, fd: FormData) => Promise<R>;

/** O React 19 limpa o formulário depois da ação; repomos o que a pessoa digitou quando há erro. */
export function Form({ action, children, submit = 'Continuar', className }: { action: A; children: React.ReactNode; submit?: string; className?: string }) {
  const saved = useRef<[string, string][]>([]);
  const ref = useRef<HTMLFormElement>(null);
  const wrapped = async (prev: unknown, fd: FormData) => {
    saved.current = [...fd.entries()].filter((e): e is [string, string] => typeof e[1] === 'string');
    return action(prev, fd);
  };
  const [st, run, pending] = useActionState(wrapped as never, null as { error?: string; ok?: string } | null);
  useEffect(() => {
    if (!st?.error || !ref.current) return;
    for (const [k, v] of saved.current) {
      const el = ref.current.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (!el || !('type' in el) || el.type === 'password' || el.type === 'hidden') continue;
      if (el.type === 'checkbox') (el as HTMLInputElement).checked = true; else el.value = v;
    }
  }, [st]);
  return (<form ref={ref} action={run} className={className}>
    {children}
    {st?.error && <div className="err" role="alert">{st.error}</div>}
    {st?.ok && <div className="ok">{st.ok}</div>}
    <button className="btn block" disabled={pending}>{pending ? 'Aguarde…' : submit}</button>
  </form>);
}
