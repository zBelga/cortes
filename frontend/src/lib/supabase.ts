'use client';

import { createBrowserClient } from '@supabase/ssr';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** `true` quando a instalação roda sem login (um usuário só). */
export const isSingleUser = process.env.NEXT_PUBLIC_AUTH_MODE !== 'supabase';

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Singleton: instanciar por render abriria uma conexão de realtime
 * por componente montado.
 */
export function supabase() {
  if (isSingleUser || !URL || !ANON_KEY) {
    throw new Error('Supabase não está configurado nesta instalação');
  }
  client ??= createBrowserClient(URL, ANON_KEY);
  return client;
}

/**
 * Token da sessão, ou `null` quando não há autenticação.
 * O cliente HTTP simplesmente omite o header `Authorization` nesse caso —
 * nenhuma tela precisa saber em qual modo a instalação está.
 */
export async function accessToken(): Promise<string | null> {
  if (isSingleUser || !URL || !ANON_KEY) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
