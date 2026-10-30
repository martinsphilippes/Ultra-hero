"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { publicBucketUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { sniffImage } from "@/lib/avatar/sniff";
import { requireRole } from "@/lib/auth/session";
import {
  brandErrorCode,
  MAX_CONTENT_LINKS,
  MAX_CREATOR_BRANDS,
  MAX_PROGRAM_PRODUCTS,
  normalizeBrandInput,
  normalizeBrandLinks,
  normalizeProductInput,
  normalizeProductLinks,
  normalizeSmartTags,
} from "@/lib/brands/admin";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Marcas, produtos externos e Smart Tags no admin (0062). Toda escrita passa por RPC security
// definer que confere is_admin() e grava em admin_audit; aqui só a forma (validação pura em
// lib/brands/admin) e a tradução do erro. Imagens: o servidor confere os bytes e grava no bucket
// público brand-media com o service role (nada é escrito no Storage com JWT de usuário).

type Result<T extends object = Record<never, never>> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

const BUCKET = "brand-media";
const MAX_IMAGE_BYTES = 1_572_864;
const uuid = z.uuid();

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("adminOps.brands.errors");
  return { ok: false, error: t(brandErrorCode(error)) };
}

// Papel exigido fora do try: requireRole redireciona quando não é admin.
async function admin() {
  const { user } = await requireRole("admin", "/admin");
  return user;
}

function revalidatePublic() {
  revalidatePath("/personalities/[slug]", "page");
  revalidatePath("/programs/[slug]", "page");
  revalidatePath("/content/[slug]", "page");
  revalidatePath("/inicio");
}

function revalidateBrands(id?: string) {
  revalidatePath("/admin/marcas");
  if (id) revalidatePath(`/admin/marcas/${id}`);
  revalidatePublic();
}

// ---------------------------------------------------------------- marcas
export async function saveBrandAction(id: string | null, input: Record<string, unknown>): Promise<Result<{ id?: string }>> {
  await admin();
  const parsedId = uuid.nullable().safeParse(id);
  const brand = normalizeBrandInput(input ?? {});
  if (!parsedId.success) return fail("invalid_input");
  if (!brand.ok) return fail(brand.error);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_brand_save", { p_id: parsedId.data, p_data: brand.value });
    if (error || !data) return fail(error ?? "generic");
    revalidateBrands(data);
    const t = await getTranslations("adminOps.brands.form");
    return { ok: true, id: data, message: parsedId.data ? t("saved") : t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteBrandAction(id: string): Promise<Result> {
  await admin();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_brand_delete", { p_id: parsed.data });
    if (error) return fail(error);
    revalidateBrands();
    const t = await getTranslations("adminOps.brands.form");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- produtos
export async function saveBrandProductAction(id: string | null, input: Record<string, unknown>): Promise<Result<{ id?: string }>> {
  await admin();
  const parsedId = uuid.nullable().safeParse(id);
  const product = normalizeProductInput(input ?? {});
  if (!parsedId.success) return fail("invalid_input");
  if (!product.ok) return fail(product.error);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_brand_product_save", { p_id: parsedId.data, p_data: product.value });
    if (error || !data) return fail(error ?? "generic");
    revalidateBrands(product.value.brand_id);
    const t = await getTranslations("adminOps.brands.product");
    return { ok: true, id: data, message: parsedId.data ? t("saved") : t("created") };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteBrandProductAction(id: string, brandId: string): Promise<Result> {
  await admin();
  const parsed = z.object({ id: uuid, brandId: uuid }).safeParse({ id, brandId });
  if (!parsed.success) return fail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_brand_product_delete", { p_id: parsed.data.id });
    if (error) return fail(error);
    revalidateBrands(parsed.data.brandId);
    const t = await getTranslations("adminOps.brands.product");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- imagem (logo/foto do produto)
const fileSchema = z.instanceof(Blob).refine((f) => f.size > 0 && f.size <= MAX_IMAGE_BYTES, "upload_size");

export async function uploadBrandImageAction(formData: FormData): Promise<Result<{ url?: string }>> {
  const user = await admin();
  const t = await getTranslations("adminOps.brands.errors");
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: t("upload_unavailable") };
  const parsed = fileSchema.safeParse(formData.get("file"));
  if (!parsed.success) return { ok: false, error: t("upload_size") };
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  // tipo pelos bytes (não pelo nome nem pelo content-type): só WebP e JPEG
  const image = sniffImage(bytes);
  if (!image) return { ok: false, error: t("upload_type") };
  const path = `${user.id}/${crypto.randomUUID()}.${image.mime === "image/webp" ? "webp" : "jpg"}`;
  try {
    const { error } = await createAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType: image.mime, cacheControl: "31536000", upsert: false });
    if (error) return { ok: false, error: t("upload_unavailable") };
    const tf = await getTranslations("adminOps.brands.image");
    return { ok: true, url: publicBucketUrl(BUCKET, base, path), message: tf("uploaded") };
  } catch {
    return { ok: false, error: t("upload_unavailable") };
  }
}

// ---------------------------------------------------------------- ligações
export async function saveCreatorBrandsAction(creatorId: string, items: unknown[]): Promise<Result> {
  await admin();
  const id = uuid.safeParse(creatorId);
  const list = normalizeBrandLinks(Array.isArray(items) ? items : [], MAX_CREATOR_BRANDS);
  if (!id.success) return fail("invalid_input");
  if (!list.ok) return fail(list.error);
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_creator_brands_save", {
      p_creator: id.data,
      p_items: list.value.map((i) => ({ brand_id: i.id, relationship: i.relationship, status: i.status })),
    });
    if (error) return fail(error);
    revalidatePath(`/admin/creators/${id.data}`);
    revalidatePublic();
    const t = await getTranslations("adminOps.brands.links");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

export async function saveProgramBrandProductsAction(programId: string, items: unknown[]): Promise<Result> {
  await admin();
  const id = uuid.safeParse(programId);
  const list = normalizeProductLinks(Array.isArray(items) ? items : [], MAX_PROGRAM_PRODUCTS);
  if (!id.success) return fail("invalid_input");
  if (!list.ok) return fail(list.error);
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_program_brand_products_save", {
      p_program: id.data,
      p_items: list.value.map((i) => ({ brand_product_id: i.id, note: i.note, status: i.status })),
    });
    if (error) return fail(error);
    revalidatePath(`/admin/programs/${id.data}`);
    revalidatePublic();
    const t = await getTranslations("adminOps.brands.links");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

export async function saveContentBrandLinksAction(contentId: string, brands: unknown[], products: unknown[]): Promise<Result> {
  await admin();
  const id = uuid.safeParse(contentId);
  const brandList = normalizeBrandLinks(Array.isArray(brands) ? brands : [], MAX_CONTENT_LINKS);
  const productList = normalizeProductLinks(Array.isArray(products) ? products : [], MAX_CONTENT_LINKS);
  if (!id.success) return fail("invalid_input");
  if (!brandList.ok) return fail(brandList.error);
  if (!productList.ok) return fail(productList.error);
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_content_brand_links_save", {
      p_content: id.data,
      p_brands: brandList.value.map((i) => ({ brand_id: i.id, relationship: i.relationship, status: i.status })),
      p_products: productList.value.map((i) => ({ brand_product_id: i.id, status: i.status })),
    });
    if (error) return fail(error);
    revalidatePath(`/admin/content/${id.data}`);
    revalidatePublic();
    const t = await getTranslations("adminOps.brands.links");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

export async function saveContentSmartTagsAction(contentId: string, tags: unknown[]): Promise<Result> {
  await admin();
  const id = uuid.safeParse(contentId);
  const list = normalizeSmartTags(Array.isArray(tags) ? tags : []);
  if (!id.success) return fail("invalid_input");
  if (!list.ok) return fail(list.error);
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_content_smart_tags_save", { p_content: id.data, p_tags: list.value });
    if (error) return fail(error);
    revalidatePath(`/admin/content/${id.data}`);
    revalidatePublic();
    const t = await getTranslations("adminOps.brands.tags");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}
