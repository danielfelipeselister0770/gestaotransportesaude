'use client';

import { FormEvent, useEffect, useState } from 'react';

type User = { id: string; name: string; role: string; municipality_id: string | null };

export default function RecuperacaoUsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/usuarios/codigo-recuperacao', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json() as { users?: User[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os usuários.');
        if (active) setUsers(data.users || []);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Erro ao carregar usuários.'); });
    return () => { active = false; };
  }, []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    if (!window.confirm('Você confirmou a identidade do usuário e deseja gerar um código válido por 15 minutos?')) return;
    setBusy(true);
    setMessage('');
    setCode('');
    try {
      const response = await fetch('/api/usuarios/codigo-recuperacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected }), cache: 'no-store',
      });
      const data = await response.json() as { code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.code) throw new Error(data.error || 'Não foi possível gerar o código.');
      setCode(data.code);
      setExpiresAt(data.expiresAt || '');
      setMessage('Código gerado. Compartilhe apenas com o usuário após verificar sua identidade.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao gerar código.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-xl p-6">
    <h1 className="text-2xl font-bold text-slate-900">Recuperação de acesso</h1>
    <p className="mt-2 text-sm text-slate-600">Gere um código somente depois de confirmar a identidade do funcionário. Não envie códigos em grupos ou canais públicos.</p>
    <form onSubmit={generate} className="mt-6 space-y-4 rounded-xl border bg-white p-5">
      <label className="block text-sm font-medium text-slate-700">Usuário
        <select required value={selected} onChange={event => { setSelected(event.target.value); setCode(''); }} className="mt-2 w-full rounded-lg border px-3 py-2">
          <option value="">Selecione um usuário</option>
          {users.map(user => <option key={user.id} value={user.id}>{user.name} — {user.role}</option>)}
        </select>
      </label>
      <button disabled={!selected || busy} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Gerando...' : 'Gerar código de recuperação'}</button>
    </form>
    {message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}
    {code && <section className="mt-4 rounded-xl border bg-white p-5">
      <p className="text-sm font-medium">Código de uso único</p>
      <p className="mt-2 break-all rounded bg-slate-100 p-3 font-mono text-sm">{code}</p>
      <button type="button" onClick={() => void navigator.clipboard.writeText(code)} className="mt-3 rounded-lg border px-3 py-2 text-sm">Copiar código</button>
      <p className="mt-3 text-xs text-slate-600">Válido até {expiresAt ? new Date(expiresAt).toLocaleString('pt-BR') : '15 minutos após emissão'}. A senha será escolhida pelo próprio usuário em /auth/codigo-recuperacao.</p>
    </section>}
  </main>;
}
