import { supabase } from './supabase';

const TOS_VERSION = '1.0.0';

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

/**
 * Sign in with Apple OAuth
 */
export async function signInWithApple() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

/**
 * Sign in with phone OTP
 */
export async function signInWithPhone(phone) {
  const { data, error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return data;
}

/**
 * Verify phone OTP
 */
export async function verifyPhoneOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data;
}

/**
 * Get current session
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Get current user
 */
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Sign out
 */
export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Get user profile (from user_profiles table)
 */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

/**
 * Check if user has accepted current ToS version
 */
export function hasAcceptedTos(profile) {
  return profile?.accepted_tos_version === TOS_VERSION;
}

/**
 * Check if user has accepted location disclaimer
 */
export function hasAcceptedLocationDisclaimer(profile) {
  return profile?.accepted_location_disclaimer === true;
}

/**
 * Accept Terms of Service
 */
export async function acceptTos(userId) {
  const { error } = await supabase
    .from('user_profiles')
    .update({
      accepted_tos_version: TOS_VERSION,
      accepted_tos_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Accept Location Disclaimer
 */
export async function acceptLocationDisclaimer(userId) {
  const { error } = await supabase
    .from('user_profiles')
    .update({
      accepted_location_disclaimer: true,
      accepted_location_disclaimer_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Update display name
 */
export async function updateDisplayName(userId, name) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Check if user is banned or suspended
 */
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
