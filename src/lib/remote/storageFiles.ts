import { supabase } from '../supabase'

/** Private Storage buckets (`audio`, `uploads`). Every object lives under "<user id>/..." and the
 * bucket policies only let its owner touch it; playback and downloads use short-lived signed URLs. */

export type Bucket = 'audio' | 'uploads'

export const SIGNED_URL_SECONDS = 3600

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Uploads (replacing an existing object); retries a couple of times for a flaky connection. */
export async function uploadFile(bucket: Bucket, path: string, body: Blob | ArrayBuffer, contentType: string): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true })
    if (!error) return
    lastError = error
    await sleep(600 * (attempt + 1))
  }
  throw lastError instanceof Error ? lastError : new Error('upload failed')
}

export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return
  await supabase.storage.from(bucket).remove(unique)
}

/** A short-lived link to the object; `downloadName` makes the browser save it under that name. */
export async function signedUrl(bucket: Bucket, path: string, downloadName?: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS, downloadName ? { download: downloadName } : undefined)
  return error ? null : data.signedUrl
}

/** Downloads an object through a signed URL. */
export async function downloadFile(bucket: Bucket, path: string): Promise<Blob | null> {
  const url = await signedUrl(bucket, path)
  if (!url) return null
  try {
    const response = await fetch(url)
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}
