import { createClient } from '@/lib/supabase/server';

export type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA';

export type UserContext = {
  id: string;
  name: string | null;
  role: UserRole;
  municipality_id: string | null;
};

export async function getCurrentUserContext() {
  const supabase = createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (!userId) {
    return { supabase, user: null as UserContext | null };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, municipality_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    return { supabase, user: null as UserContext | null };
  }

  return {
    supabase,
    user: {
      id: profile.id,
      name: profile.name ?? null,
      role: profile.role as UserRole,
      municipality_id: profile.municipality_id ?? null,
    },
  };
}

export function scopeToMunicipality<T extends { eq: (column: string, value: unknown) => T }>(
  query: T,
  user: UserContext | null,
) {
  if (user && user.role !== 'ADMIN' && user.municipality_id) {
    return query.eq('municipality_id', user.municipality_id);
  }
  return query;
}
