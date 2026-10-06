'use client';

import { useEffect, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Confirmando seu convite...');

  useEffect(() => {
    const supabase = createClient();

    async function finishAuthentication() {
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const tokenHash = search.get('token_hash');
      const type = (search.get('type') ?? hash.get('type')) as EmailOtpType | null;

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });

        if (error) {
          setMessage(`Não foi possível confirmar o convite: ${error.message}`);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        setMessage('O convite não pôde ser confirmado. Solicite um novo convite ao gestor.');
        return;
      }

      if (type === 'invite' || type === 'recovery') {
        window.location.replace('/motorista/definir-senha');
        return;
      }

      window.location.replace('/');
    }

    finishAuthentication().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir o acesso.');
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-2xl">🚐</div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Acesso do motorista</h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
      </div>
    </main>
  );
}
