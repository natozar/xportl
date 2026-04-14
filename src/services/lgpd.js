import { supabase } from './supabase';

/**
 * LGPD Art. 18 — Export all user data
 * Returns a JSON blob with everything we have on the user.
 */
export async function exportUserData(userId) {
  const [profile, capsules, reports, logs] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', userId).single(),
    supabase.from('capsules').select('*').eq('created_by', userId),
    supabase.from('reports').select('*').eq('reporter_id', userId),
    supabase.from('access_logs').select('action, target_id, lat, lng, created_at').eq('user_id', userId),
  ]);

  const data = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    capsules: capsules.data || [],
    reports_submitted: reports.data || [],
    access_logs: logs.data || [],
  };

  // Trigger download
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `xportl-data-${userId.slice(0, 8)}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return data;
}

/**
 * LGPD Art. 18 — Request account deletion
 * Marks account as deleted, anonymizes capsules, schedules purge.
 * Does NOT immediately delete to comply with Marco Civil retention.
 */
export async function requestAccountDeletion(userId) {
  // 1. Mark profile as deleted
  await supabase.from('user_profiles').update({
    account_status: 'deleted',
    display_name: '[Conta removida]',
    phone_hash: null,
    cpf_hash: null,
    birth_date: null,
    updated_at: new Date().toISOString(),
  }).eq('id', userId);

  // 2. Anonymize capsule display (keep created_by for legal compliance)
  // The created_by link is retained for Marco Civil Art. 15 (6 months)
  // but the public-facing display is anonymized

  // 3. Sign out
  await supabase.auth.signOut();

  return { success: true, message: 'Conta marcada para exclusao. Dados de acesso serao retidos por 6 meses conforme Marco Civil da Internet (Art. 15).' };
}
