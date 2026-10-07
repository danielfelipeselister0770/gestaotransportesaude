create table if not exists public.user_admin_history (
 id uuid primary key default gen_random_uuid(),
 municipality_id uuid references public.municipalities(id),
 target_user_id uuid,
 actor_user_id uuid references public.profiles(id),
 action text not null check (action in ('CREATE','UPDATE','RESET_PASSWORD','DELETE')),
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists user_admin_history_municipality_created_idx on public.user_admin_history(municipality_id,created_at desc);
alter table public.user_admin_history enable row level security;
create policy "user_admin_history_select" on public.user_admin_history for select to authenticated using (
 private.current_user_role() = 'ADMIN' or
 (private.current_user_role() = 'GESTOR' and municipality_id = private.current_user_municipality_id())
);