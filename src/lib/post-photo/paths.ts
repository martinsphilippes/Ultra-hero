import { AVATAR_PATH_RE, publicBucketUrl, storedBucketPath } from "@/lib/avatar/paths";
import { POST_PHOTO_BUCKET } from "./constants";

// URLs das fotos de post no bucket público post-photos (0043):
// <base>/storage/v1/object/public/post-photos/<user>/<uuid>.(webp|jpg). Funções puras.

export function publicPostPhotoUrl(baseUrl: string, path: string): string {
  return publicBucketUrl(POST_PHOTO_BUCKET, baseUrl, path);
}

/** Caminho "<user>/<uuid>.ext" quando a URL é uma foto de post deste projeto; senão null. */
export function storedPostPhotoPath(url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  return storedBucketPath(POST_PHOTO_BUCKET, url, baseUrl);
}

/** media_ref de um corpo com foto: o caminho do objeto, no mesmo formato do CHECK da 0043. */
export function isPostPhotoPath(ref: string | null | undefined): ref is string {
  return typeof ref === "string" && AVATAR_PATH_RE.test(ref);
}

/**
 * Post com foto (0043): artigo cuja capa é uma foto do bucket post-photos deste projeto. O banco só
 * aceita essa capa vinda do próprio herói (content_post_photo_cover_guard).
 */
export function isPhotoPost(content: { type: string; cover_url: string | null | undefined }, baseUrl: string | null | undefined): boolean {
  return content.type === "article" && storedPostPhotoPath(content.cover_url, baseUrl) !== null;
}
