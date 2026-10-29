import { sniffImage, type SniffResult } from "@/lib/avatar/sniff";
import { COVER_MAX_UPLOAD_BYTES, COVER_MAX_WIDTH, COVER_MIN_WIDTH } from "./constants";

// Bytes da capa que chegam ao servidor (já reduzidos no aparelho). O tipo vem dos magic bytes.

export type CoverUploadCheck =
  | { ok: true; image: SniffResult }
  | { ok: false; error: "empty_file" | "file_too_large" | "not_image" | "invalid_dimensions" };

/** WebP ou JPEG de verdade, 16:9 (um pixel de folga no arredondamento), de 640 a 1600 px de largura, até 3 MiB. */
export function validateCoverBytes(bytes: Uint8Array): CoverUploadCheck {
  if (bytes.length === 0) return { ok: false, error: "empty_file" };
  if (bytes.length > COVER_MAX_UPLOAD_BYTES) return { ok: false, error: "file_too_large" };
  const image = sniffImage(bytes);
  if (!image) return { ok: false, error: "not_image" };
  const expectedHeight = (image.width * 9) / 16;
  if (image.width < COVER_MIN_WIDTH || image.width > COVER_MAX_WIDTH || Math.abs(image.height - expectedHeight) > 1) {
    return { ok: false, error: "invalid_dimensions" };
  }
  return { ok: true, image };
}
