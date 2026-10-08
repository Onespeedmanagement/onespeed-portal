'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export type FormState = { ok?: string; error?: string };

export async function addStore(_prev: FormState, form: FormData): Promise<FormState> {
  await requireRole('admin');
  const name = String(form.get('name') || '').trim();
  const portfolioId = String(form.get('portfolio_id') || '');
  const posMatch = String(form.get('pos_match') || '').trim() || name;
  if (!name) return { error: 'Type the store name.' };
  if (!portfolioId) return { error: 'Pick a portfolio.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.from('businesses').insert({ name, portfolio_id: portfolioId, pos_match: posMatch });
  if (error) return { error: error.code === '23505' ? 'A store with that name already exists.' : 'Couldn’t add the store.' };
  await supabase.from('audit_log').insert({ action: 'store.added', details: { name, posMatch } });
  revalidatePath('/admin/stores');
  revalidatePath('/portfolio');
  return { ok: `${name} added.` };
}

export async function updateStore(id: string, fields: { name?: string; pos_match?: string; active?: boolean }): Promise<FormState> {
  await requireRole('admin');
  const supabase = await supabaseServer();
  const clean: Record<string, unknown> = {};
  if (fields.name !== undefined) { if (!fields.name.trim()) return { error: 'Name can’t be empty.' }; clean.name = fields.name.trim(); }
  if (fields.pos_match !== undefined) clean.pos_match = fields.pos_match.trim() || null;
  if (fields.active !== undefined) clean.active = fields.active;
  const { error } = await supabase.from('businesses').update(clean).eq('id', id);
  if (error) return { error: error.code === '23505' ? 'A store with that name already exists.' : 'Couldn’t save.' };
  await supabase.from('audit_log').insert({ action: 'store.updated', details: { id, ...clean } });
  revalidatePath('/admin/stores');
  revalidatePath('/portfolio');
  return { ok: 'Saved.' };
}
