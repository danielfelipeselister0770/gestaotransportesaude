'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function SetPasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.replace('/login');
        return;
      }
      setChecking(false);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (password.length < 8) {
      setErrorMessage('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmation) {
      setErrorMessage('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(`Não foi possível definir a senha: ${error.message}`);
      setLoading(false);
      return;
    }

    window.location.replace('/motorista');
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="text-sm text-slate-500">Preparando seu acesso...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-2xl">🚐</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Crie sua senha</h1>
          <p className="mt-2 text-sm text-slate-500">Seu convite foi confirmado. Agora defina a senha que você usará para entrar no sistema.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Nova senha</label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border py-2.5 pl-9 pr-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Mínimo de 8 caracteres"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirmation" className="mb-2 block text-sm font-medium text-slate-700">Confirme a senha</label>
            <input
              id="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="Digite novamente"
            />
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Salvando...' : 'Criar senha e acessar'}
          </button>
        </form>
      </div>
    </main>
  );
}
