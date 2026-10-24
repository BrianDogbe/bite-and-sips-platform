/**
 * Photos that must not be shown to customers yet. The salad photo carries a third-party watermark and the drinks
 * photo shows products we don't sell. Remove a path from this list once the owner approves or replaces it.
 * Admin screens still show these, so staff can see which items need a new photo.
 */
export const UNAPPROVED_PHOTOS: ReadonlySet<string> = new Set(['/brand/crunchy-salad.jpg', '/brand/cat-drinks.jpg']);

export function approvedPhoto(src: string | null | undefined): string | null {
  return src && !UNAPPROVED_PHOTOS.has(src) ? src : null;
}
