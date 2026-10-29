import 'server-only';
import sharp from 'sharp';
import {ORIGINAL_IMAGE_MAX_PIXELS} from './image-upload-policy';

/** Consume the complete default image/frame without exporting a full-size raw
 * buffer just to discard it. Metadata alone does not detect a truncated raster.
 * A full-image reduction (no extract/nearest sampling) still exercises the
 * decoder, including its error policy. This pixel is only a validation sink;
 * storage and the existing preview pipeline always receive the original bytes.
 */
export async function validateUploadImageDecode(bytes: Buffer): Promise<void> {
  const decoder = sharp(bytes, {limitInputPixels: ORIGINAL_IMAGE_MAX_PIXELS, failOn: 'error'});
  try {
    await decoder.removeAlpha().resize(1, 1, {
      fit: 'fill', kernel: 'linear', fastShrinkOnLoad: false,
    }).raw().toBuffer();
  } finally {
    decoder.destroy();
  }
}
