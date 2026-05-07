/**
 * Generate a URL-friendly slug from a free-form filename or title.
 *
 * Used as the public permalink segment in `/media/<slug>` and as the
 * leaf filename portion of the S3 object key.
 */
export function slugifyMediaName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim()
}
