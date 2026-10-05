'use client';

import { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage('E-mail ou senha inválidos. Verifique os dados e tente novamente.');
      setLoading(false);
      return;
    }

    window.location.assign('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-2xl">🚐</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Transporte Saúde</h1>
          <p className="mt-1 text-sm text-slate-500">Gestão municipal de transporte em saúde</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">E-mail</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="seu@email.com" />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Senha</label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input id="password" name="password" type="password" autoComplete="current-password" required value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border py-2.5 pl-9 pr-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="••••••••" />
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{errorMessage}</div>
          )}

          <button type="submit" disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            <LogIn size={18} />
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-slate-600" />
          <span>Acesso restrito aos usuários autorizados do sistema.</span>
        </div>
      </div>
    </main>
  );
}
