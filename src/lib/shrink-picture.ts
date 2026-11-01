import { fitWithin } from '@/lib/picture-upload';

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    // 'from-image' turns a phone photo the right way up.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

/** Shrinks a picture to at most `maxWidth` pixels wide and re-encodes it (WebP, or JPEG where the browser cannot write WebP).
 *  Runs in the admin's browser, so nothing large is ever uploaded. Throws when the file cannot be read as a picture. */
export async function shrinkPicture(file: File, maxWidth: number): Promise<Blob> {
  const bitmap = await decode(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxWidth);
  const draw = (background: string | null): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize pictures.');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  };
  try {
    const webp = await toBlob(draw(null), 'image/webp', 0.85);
    if (webp && webp.type === 'image/webp') return webp;
    // JPEG has no transparency, so a transparent picture gets a white background.
    const jpeg = await toBlob(draw('#ffffff'), 'image/jpeg', 0.88);
    if (jpeg) return jpeg;
    throw new Error('The picture could not be converted.');
  } finally {
    bitmap.close();
  }
}

/** A square picture of exactly `size` pixels for a profile photo: the middle of the picture is kept and the rest is cut off.
 *  WebP, or JPEG where the browser cannot write WebP. Throws when the file cannot be read as a picture. */
export async function shrinkSquare(file: File, size: number): Promise<Blob> {
  const bitmap = await decode(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);
    const out = Math.max(1, Math.min(size, side));
    const draw = (background: string | null): HTMLCanvasElement => {
      const canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot resize pictures.');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, out, out);
      }
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
      return canvas;
    };
    const webp = await toBlob(draw(null), 'image/webp', 0.85);
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await toBlob(draw('#ffffff'), 'image/jpeg', 0.88);
    if (jpeg) return jpeg;
    throw new Error('The picture could not be converted.');
  } finally {
    bitmap.close();
  }
}
