'use client';

import { FormEvent, useState } from 'react';
import { LockKeyhole } from 'lucide-react';

export default function TrocarSenhaPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (password.length < 8) return setMessage('A nova senha deve ter pelo menos 8 caracteres.');
    if (password !== confirm) return setMessage('As senhas não conferem.');
    setSaving(true);
    const response = await fetch('/api/auth/trocar-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(result.error || 'Não foi possível alterar a senha.'); setSaving(false); return; }
    window.location.assign('/');
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white"><LockKeyhole /></div>
      <h1 className="text-2xl font-bold text-slate-900">Crie sua nova senha</h1>
      <p className="mt-2 text-sm text-slate-500">Por segurança, troque a senha inicial antes de acessar o sistema.</p>
      <div className="mt-6 space-y-4">
        <label className="block text-sm">Nova senha<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" /></label>
        <label className="block text-sm">Confirmar nova senha<input type="password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" /></label>
      </div>
      {message && <div className="mt-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm">{message}</div>}
      <button disabled={saving} className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Alterar senha e continuar'}</button>
    </form>
  </main>;
}
