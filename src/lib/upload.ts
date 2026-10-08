export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2048;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateImage(file: { size: number; type: string }, { checkSize = true } = {}): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Choose a JPEG, PNG, or WebP photo.";
  if (file.size === 0) return "This file is empty. Choose a dice photo.";
  if (checkSize && file.size > MAX_IMAGE_BYTES) return "This photo is too large. Choose one under 10 MB.";
  return null;
}
