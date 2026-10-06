'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LockKeyhole, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type AccessInfo = { name: string; email: string };

export default function FirstAccessPage() {
  const supabase = createClient();
  const [token, setToken] = useState('');
  const [info, setInfo] = useState<AccessInfo | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const currentToken = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(currentToken);
    if (!currentToken) {
      setErrorMessage('Link de primeiro acesso inválido.');
      setLoading(false);
      return;
    }

    fetch('/api/motoristas/acesso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate', token: currentToken }),
    })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? 'Link de acesso inválido.');
        setInfo({ name: result.name, email: result.email });
      })
      .catch(error => setErrorMessage(error instanceof Error ? error.message : 'Link de acesso inválido.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (!temporaryPassword) {
      setErrorMessage('Informe a senha provisória recebida do gestor.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('A senha definitiva deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('As senhas não coincidem.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/motoristas/acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'activate',
          token,
          temporaryPassword,
          password,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível ativar o acesso.');

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: result.email ?? info?.email ?? '',
        password,
      });
      if (loginError) throw new Error('Senha criada, mas não foi possível entrar automaticamente: ' + loginError.message);

      window.location.replace('/motorista');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível ativar o acesso.');
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4"><div className="text-sm text-slate-500">Validando seu acesso...</div></main>;
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-2xl">🚐</div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Primeiro acesso</h1>
        {info ? <p className="mt-2 text-sm text-slate-500">Olá, <strong>{info.name}</strong>. Crie sua senha definitiva para acessar o sistema.</p> : <p className="mt-2 text-sm text-slate-500">Não foi possível validar este acesso.</p>}
      </div>

      {info && <form onSubmit={handleSubmit} className="space-y-5">
        <div><label className="mb-2 block text-sm font-medium text-slate-700">Usuário</label><div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm">{info.email}</div></div>

        <div><label htmlFor="temporaryPassword" className="mb-2 block text-sm font-medium text-slate-700">Senha provisória</label><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input id="temporaryPassword" type="password" autoComplete="one-time-code" required value={temporaryPassword} onChange={e => setTemporaryPassword(e.target.value)} className="w-full rounded-lg border py-2.5 pl-9 pr-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" placeholder="Senha entregue pelo gestor"/></div></div>

        <div><label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Nova senha</label><div className="relative"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border py-2.5 pl-9 pr-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" placeholder="Mínimo de 8 caracteres"/></div></div>

        <div><label htmlFor="confirmation" className="mb-2 block text-sm font-medium text-slate-700">Confirme a nova senha</label><input id="confirmation" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" placeholder="Digite novamente"/></div>

        {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{errorMessage}</div>}

        <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? 'Ativando acesso...' : 'Criar senha e entrar'}
        </button>
      </form>}
    </div>
  </main>;
}
