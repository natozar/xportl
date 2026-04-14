import { supabase } from './supabase';

const BUCKET = 'capsule-media';

/**
 * Upload a file (photo or audio) to Supabase Storage
 * @param {File|Blob} file
 * @param {'image'|'audio'} mediaType
 * @returns {{ url: string, path: string }}
 */
export async function uploadMedia(file, mediaType) {
  const ext = mediaType === 'image' ? 'webp' : 'webm';
  const path = `${mediaType}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || (mediaType === 'image' ? 'image/webp' : 'audio/webm'),
      cacheControl: '3600',
    });

  if (error) {
    console.error('[XPortl] Upload failed:', error.message);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return { url: urlData.publicUrl, path };
}

/**
 * Delete a file from Storage (used during self-destruct)
 * @param {string} mediaUrl - The full public URL
 */
export async function deleteMedia(mediaUrl) {
  if (!mediaUrl) return;

  // Extract path from full URL: .../storage/v1/object/public/capsule-media/IMAGE_PATH
  const marker = `/object/public/${BUCKET}/`;
  const idx = mediaUrl.indexOf(marker);
  if (idx === -1) return;

  const path = mediaUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error('[XPortl] Delete media failed:', error.message);
}
