import { supabase } from './supabase';

const TOS_VERSION = '1.0.0';

/**
 * Dynamic redirect URL — always uses the current domain.
 * Works on localhost, ngrok, vercel, custom domain — zero hardcode.
 */
function getRedirectUrl() {
  const url = window.location.origin;
  console.log('[XPortl Auth] Redirect URL:', url);
  return url;
}

// ── OAuth ──

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getRedirectUrl(),
    },
  });
  if (error) throw error;
  return data;
}

// ── Email + Password ──

export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getRedirectUrl() },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ── Phone + SMS OTP ──

export async function sendPhoneOtp(phone) {
  const { data, error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return data;
}

export async function verifyPhoneOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data;
}

// ── Session ──

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ── Profile ──

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export function hasAcceptedTos(profile) {
  return profile?.accepted_tos_version === TOS_VERSION;
}

export function hasAcceptedLocationDisclaimer(profile) {
  return profile?.accepted_location_disclaimer === true;
}

export async function acceptTos(userId) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ accepted_tos_version: TOS_VERSION, accepted_tos_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function acceptLocationDisclaimer(userId) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ accepted_location_disclaimer: true, accepted_location_disclaimer_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateDisplayName(userId, name) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export function isAccountBlocked(profile) {
  if (!profile) return false;
  if (profile.account_status === 'banned') return { blocked: true, reason: 'Conta banida: ' + (profile.ban_reason || 'violacao dos termos') };
  if (profile.account_status === 'suspended' && profile.suspended_until) {
    if (new Date(profile.suspended_until) > new Date()) {
      return { blocked: true, reason: `Conta suspensa ate ${new Date(profile.suspended_until).toLocaleDateString('pt-BR')}` };
    }
  }
  return false;
}

export { TOS_VERSION };
