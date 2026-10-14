import { supabase } from '../supabase'

/** The private Storage bucket (`uploads`). Every object lives under "<user id>/..." and the
 * bucket policies only let its owner touch it. */

export type Bucket = 'uploads'

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
