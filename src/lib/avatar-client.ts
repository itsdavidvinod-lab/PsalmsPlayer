// Browser-side work on a person's own profile picture. Uses the signed-in browser session, so the database rules decide what is allowed.
import { AVATAR_BUCKET, AVATAR_SIZE, AVATAR_STORED_MAX_BYTES, avatarObjectName, avatarPathFromUrl, checkAvatarFile } from '@/lib/avatar';
import { shrinkSquare } from '@/lib/shrink-picture';
import { createClient } from '@/lib/supabase/client';

export type AvatarOutcome = { ok: true; url: string | null } | { ok: false; text: string };

/** Replaces the picture: cuts the chosen file to a small square, uploads it to the person's own folder, points the profile at it and
 *  deletes the previous one. `url` of the result is the new address. */
export async function changeAvatar(userId: string, file: File, previousUrl: string | null): Promise<AvatarOutcome> {
  const check = checkAvatarFile(file);
  if (!check.ok) return { ok: false, text: check.text };
  let blob: Blob;
  try {
    blob = await shrinkSquare(file, AVATAR_SIZE);
  } catch {
    return { ok: false, text: 'That file could not be read as a picture.' };
  }
  if (blob.size > AVATAR_STORED_MAX_BYTES) return { ok: false, text: 'That picture is still too large after shrinking. Choose a simpler one.' };
  const supabase = createClient();
  const path = avatarObjectName(userId, crypto.randomUUID(), blob.type);
  const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
  if (up.error) return { ok: false, text: 'The picture could not be uploaded. Please try again.' };
  const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  const saved = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (saved.error) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]); // nothing points at it
    return { ok: false, text: 'The picture could not be saved. Please try again.' };
  }
  const old = avatarPathFromUrl(previousUrl, userId);
  if (old) await supabase.storage.from(AVATAR_BUCKET).remove([old]); // best effort: a leftover file is harmless
  return { ok: true, url };
}

/** Goes back to the picture from the Google account: clears the address on the profile, then deletes every file in the person's folder. */
export async function removeAvatar(userId: string): Promise<AvatarOutcome> {
  const supabase = createClient();
  const cleared = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (cleared.error) return { ok: false, text: 'The picture could not be removed. Please try again.' };
  await deleteAvatarFiles(userId);
  return { ok: true, url: null };
}

/** Deletes every file in the person's own avatar folder. Best effort; used before an account is deleted so no file is left behind. */
export async function deleteAvatarFiles(userId: string): Promise<void> {
  try {
    const supabase = createClient();
    const listed = await supabase.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
    const names = ((listed.data ?? []) as { name: string }[]).map((f) => `${userId}/${f.name}`);
    if (names.length > 0) await supabase.storage.from(AVATAR_BUCKET).remove(names);
  } catch {
    // Nothing more can be done from here; the files are small, public only by an unguessable address, and the profile no longer points at them.
  }
}
