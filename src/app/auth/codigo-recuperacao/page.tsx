'use client';

import { FormEvent, useState } from 'react';

export default function CodigoRecuperacaoPage() {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12 || password.length > 128) {
      setMessage('A senha deve ter de 12 a 128 caracteres.');
      return;
    }
    if (password !== confirm) {
      setMessage('As senhas não conferem.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/resgatar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), password }),
        cache: 'no-store',
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) {
        setMessage(result.error || 'Não foi possível redefinir a senha.');
        return;
      }
      setDone(true);
      setCode('');
      setPassword('');
      setConfirm('');
      setMessage('Senha atualizada. Volte ao login e entre com sua nova senha.');
    } catch {
      setMessage('Falha de conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Recuperar acesso por código</h1>
      <p className="mt-2 text-sm text-slate-600">Solicite um código a um gestor autorizado da sua prefeitura. Se você for o único gestor, procure o administrador geral da VitaRota.</p>
      {!done && <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm text-slate-800">Código de recuperação
          <input required type="text" autoComplete="off" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} minLength={48} maxLength={48} placeholder="Cole o código recebido" className="mt-1 w-full rounded-lg border px-3 py-2.5 font-mono text-sm" />
        </label>
        <label className="block text-sm text-slate-800">Nova senha
          <input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
        </label>
        <label className="block text-sm text-slate-800">Confirmar nova senha
          <input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
        </label>
        <p className="text-xs text-slate-500">O código expira em 15 minutos e só pode ser utilizado uma vez. Use uma senha com pelo menos 12 caracteres.</p>
        <button disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-white disabled:opacity-50">{busy ? 'Validando...' : 'Definir nova senha'}</button>
      </form>}
      {message && <p role="status" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
      <a href="/login" className="mt-5 inline-block text-sm text-blue-700 hover:underline">Voltar ao login</a>
    </div>
  </main>;
}
