'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function RecuperarSenhaPage() {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && active) {
        setRecovery(true);
        setMessage('');
      }
    });

    async function processRecoveryLink() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const hash = new URLSearchParams(url.hash.slice(1));
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const recoveryLink = Boolean(code || tokenHash || (accessToken && refreshToken) || hash.get('type') === 'recovery');
      if (!recoveryLink) return;

      let error: { message: string } | null = null;
      if (code) {
        ({ error } = await supabase.auth.exchangeCodeForSession(code));
      } else if (tokenHash) {
        ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }));
      } else if (accessToken && refreshToken) {
        ({ error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
      }
      if (!active) return;
      if (error) {
        setMessage('O link de recuperação expirou ou é inválido. Solicite um novo link.');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session) {
        setRecovery(true);
        setMessage('');
        window.history.replaceState({}, '', url.pathname);
      } else {
        setMessage('Não foi possível validar o link. Solicite um novo link de recuperação.');
      }
    }
    void processRecoveryLink();
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/auth/recuperar-senha',
    });
    setBusy(false);
    if (error) {
      const limited = error.code === 'over_email_send_rate_limit' || error.status === 429;
      setMessage(limited
        ? 'Limite temporário de envio de e-mails atingido. Aguarde antes de solicitar outro link.'
        : 'Não foi possível solicitar a recuperação. Tente novamente mais tarde.');
      return;
    }
    setDone(true);
    setMessage('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha. Confira também o spam.');
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setMessage('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setMessage('As senhas não conferem.');
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage('Não foi possível atualizar a senha. Solicite um novo link e tente novamente.');
      return;
    }
    setDone(true);
    setMessage('Senha atualizada com sucesso. Você já pode entrar com sua nova senha.');
    await supabase.auth.signOut({ scope: 'local' });
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">{recovery ? 'Definir nova senha' : 'Recuperar acesso'}</h1>
      <p className="mt-2 text-sm text-slate-600">{recovery ? 'Crie uma senha segura para sua conta.' : 'Informe seu e-mail para receber um link de recuperação.'}</p>
      {!done && (recovery ? <form onSubmit={savePassword} className="mt-6 space-y-4">
        <label className="block text-sm">Nova senha<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" /></label>
        <label className="block text-sm">Confirmar senha<input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" /></label>
        <button disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-white disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
      </form> : <form onSubmit={sendLink} className="mt-6 space-y-4">
        <label className="block text-sm">E-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" /></label>
        <button disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-white disabled:opacity-50">{busy ? 'Enviando...' : 'Enviar link de recuperação'}</button>
      </form>)}
      {message && <p role="status" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
      <a href="/login" className="mt-5 inline-block text-sm text-blue-700 hover:underline">Voltar ao login</a>
    </div>
  </main>;
}
