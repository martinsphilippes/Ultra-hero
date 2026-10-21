# Interface `VideoProvider` — contrato de integração de vídeo

- **Status:** Proposta técnica
- **Data:** 2026-10-20
- **Relacionado:** `ADR-001-video-provider.md`

## 1. Objetivo

Isolar o app do fornecedor de vídeo. Páginas e componentes só conhecem `VideoProvider`; o fornecedor é escolhido por variável de ambiente. No POC roda `EmbedProvider` (custo zero). `CloudflareStreamProvider` atende o vídeo gravado pelo herói (upload tus + iframe, seção 5.2); `MuxProvider` é stub. Ambos falham de forma clara se faltarem chaves.

## 2. Modelo de dados

A tabela `media` (Supabase) guarda uma referência opaca, nunca uma URL final:

```ts
// src/lib/video/types.ts
export type VideoProviderKind = "embed" | "cloudflare-stream" | "mux";

/** Referência opaca persistida no banco. */
export interface MediaRef {
  provider: VideoProviderKind;
  /** YouTube/Vimeo: ID do vídeo. Cloudflare: uid. Mux: playbackId. */
  id: string;
  /** Subtipo do embed. Ignorado pelos outros providers. */
  source?: "youtube" | "vimeo";
  /** true quando exige token/URL assinada (conteúdo premium). */
  premium?: boolean;
  durationSec?: number;
}
```

Regra: `premium` é decidido pelo domínio (plano simulado), não pelo provider. O provider apenas assina ou não.

## 3. Contrato

```ts
// src/lib/video/provider.ts
import "server-only"; // nunca expor chaves ao cliente

export interface PlaybackOptions {
  signed: boolean;
  userId?: string; // vai nos claims do token (auditoria)
  ttlSeconds?: number; // padrão 3600
}

export type PlaybackSource =
  | {
      type: "hls";
      url: string;
      poster?: string;
      captions?: CaptionTrack[];
      expiresAt?: string;
    }
  | { type: "iframe"; url: string; title: string }
  | { type: "unavailable"; reason: "missing-keys" | "not-ready" | "forbidden" };

export interface CaptionTrack {
  lang: "pt-BR" | "en" | "es" | string;
  url: string;
  label: string;
}

export interface EmbedInfo {
  html?: string;
  url: string;
  aspectRatio: "16/9" | "9/16" | "1/1";
}

export interface UploadTicket {
  uploadUrl: string; // URL de uso único (tus/PUT)
  mediaRef: MediaRef; // ref provisória a salvar com status "uploading"
  expiresAt: string;
  protocol: "tus" | "put" | "post";
}

export interface CreateUploadOptions {
  creatorId: string;
  maxDurationSec: number; // reserva storage (Cloudflare) / validação
  premium: boolean; // define requireSignedURLs / playback policy
  captions?: Array<"pt" | "en" | "es">; // auto-legendas, se suportado
}

export type WebhookResult =
  | { ok: true; mediaId: string; status: "ready" | "errored" | "deleted" }
  | { ok: false; reason: "bad-signature" | "unknown-event" | "ignored" };

export interface VideoProvider {
  readonly kind: VideoProviderKind;

  /** Fonte de reprodução para o player (server action / route handler). */
  getPlaybackSource(
    ref: MediaRef,
    opts: PlaybackOptions,
  ): Promise<PlaybackSource>;

  /** Embed simples para cards e previews sem autenticação. */
  getEmbed(ref: MediaRef): EmbedInfo;

  /** Opcional: URL de upload direto para o portal do criador. */
  createUploadUrl?(opts: CreateUploadOptions): Promise<UploadTicket>;

  /** Opcional: valida assinatura e traduz evento do fornecedor. */
  handleWebhook?(rawBody: string, headers: Headers): Promise<WebhookResult>;
}
```

Regras do contrato:

- `getPlaybackSource` com `signed: true` **deve** falhar (`forbidden`) se `userId` estiver ausente.
- Nunca lançar exceção por falta de chave; retornar `unavailable/missing-keys` para a UI mostrar fallback.
- Toda URL assinada tem TTL curto (≤ 1 h) e é gerada no servidor.
- `handleWebhook` é idempotente: reprocessar o mesmo evento não altera estado.

## 4. Factory

```ts
// src/lib/video/index.ts
export function getVideoProvider(): VideoProvider {
  switch (process.env.VIDEO_PROVIDER ?? "embed") {
    case "cloudflare-stream":
      return new CloudflareStreamProvider();
    case "mux":
      return new MuxProvider();
    default:
      return new EmbedProvider();
  }
}
```

Validação com `zod` no boot (`src/lib/env.ts`): se `VIDEO_PROVIDER` for pago e faltar chave, o app sobe com aviso e o provider responde `missing-keys`.

## 5. Adapters

### 5.1 `EmbedProvider` (implementado no POC)

- `getPlaybackSource` → `{ type: "iframe" }` com `https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1` ou `https://player.vimeo.com/video/{id}?dnt=1`.
- `signed: true` é ignorado com log de aviso (não há assinatura em embeds); conteúdo premium no POC é protegido só pela UI/RLS.
- `getEmbed` → mesma URL + `aspectRatio` do `MediaRef`.
- `createUploadUrl`/`handleWebhook` não implementados; o portal do criador aceita colar um link e valida o ID com regex.
- **Env:** nenhuma. CSP precisa liberar `frame-src` para os domínios acima.

### 5.2 `CloudflareStreamProvider` (implementado sem assinatura; testado com fetch simulado)

Uso no produto: o herói grava no celular e publica direto (até 180 s). Código em `src/lib/video/providers/cloudflare-stream.ts`; miniatura em `src/app/media/stream/[uid]/thumbnail/route.ts`; testes em `tests/unit/cloudflare-stream.test.ts`.

- **Upload (tus, direto do navegador):** o servidor chama `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/stream?direct_user=true` com `Authorization: Bearer <token>`, `Tus-Resumable: 1.0.0`, `Upload-Length: <bytes>`, `Upload-Creator: <creatorId>` e `Upload-Metadata` (pares `chave base64(valor)` separados por vírgula) com `maxDurationSeconds` (180), `expiry` (RFC 3339, +30 min) e `name` (nome do arquivo saneado). A resposta traz a URL de uso único no header `Location` e o uid no header `stream-media-id`; o navegador envia o arquivo com `tus-js-client` direto para essa URL (o arquivo não passa pelo nosso servidor). Escolhemos tus mesmo para arquivos pequenos porque o POST simples do Direct Creator Upload aceita só até 200 MB e o tus retoma upload interrompido no celular. Arquivos ≤ 0 ou > 2 GB são recusados antes da rede. `requiresignedurls` **não** é enviado: a regra free/premium é do admin e a assinatura ainda não está ativa.
- **Status:** `GET /accounts/{account_id}/stream/{uid}` → `result.readyToStream`, `result.status.state` (`pendingupload`, `downloading`, `queued`, `inprogress`, `ready`, `error`, `live-inprogress`), `result.duration` (segundos; `-1` = desconhecida), `result.creator`. Mapeamento: `error` → `errored`; `ready` com `readyToStream` → `ready`; o resto → `pending`. Erro HTTP vira `CloudflareStreamError` com `status` (404 = vídeo inexistente).
- **Playback:** `{ type: "iframe", url: "https://customer-{CODE}.cloudflarestream.com/{uid}/iframe?poster=<miniatura codificada>" }`. Iframe em vez de HLS porque o projeto não tem `hls.js`; o player do Stream cobre Safari e Chrome. `getEmbed` devolve a mesma URL com `aspectRatio: "16/9"`: o `MediaRef` não guarda dimensões, e o player encaixa vídeo vertical com faixas laterais.
- **Premium (`signed: true`):** sem `CLOUDFLARE_STREAM_SIGNING_KEY_ID`/`_PEM` → `NotConfiguredError` (a página mostra "indisponível"). Com as chaves, o token JWT ainda não foi implementado e o erro continua explícito.
- **Miniatura:** `https://customer-{CODE}.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg?time=<n>s&height=<px>`. O app serve por proxy em `GET /media/stream/{uid}/thumbnail` (mesmo domínio, otimizado pelo `next/image`, `Cache-Control: public, max-age=86400, s-maxage=86400`): 404 para uid inválido, vídeo inexistente ou Stream não configurado; 502 se o Cloudflare falhar. O `cover_url` do conteúdo recebe esse caminho (`thumbnailPath(uid)`).
- **Ainda não feito:** webhook (`Webhook-Signature`), legendas automáticas, token assinado.
- **Env:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE` (obrigatórias; sem elas `NotConfiguredError` e `isVideoUploadConfigured()` = false); `CLOUDFLARE_STREAM_SIGNING_KEY_ID`/`_PEM` só para premium; `CLOUDFLARE_STREAM_WEBHOOK_SECRET` quando houver webhook.
- **Fontes (verificadas em 2026-10-21):** [Direct Creator Uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/), [Resumable uploads (tus)](https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/), [API: Get video](https://developers.cloudflare.com/api/resources/stream/methods/get/), [Stream Player](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/), [Miniaturas](https://developers.cloudflare.com/stream/viewing-videos/displaying-thumbnails/).

### 5.3 `MuxProvider` (stub)

- Playback: `https://stream.mux.com/{playbackId}.m3u8`; se `signed`, anexa `?token={JWT}` (RS256, `aud: "v"`, `sub: playbackId`, `exp`); thumbnails via `image.mux.com` com token `aud: "t"`.
- Upload: `POST /video/v1/uploads` com `cors_origin`, `new_asset_settings.playback_policy: premium ? ["signed"] : ["public"]`, `generated_subtitles` para `pt`/`en`/`es`.
- Webhook: validar header `Mux-Signature` (HMAC-SHA256, tolerância 5 min); eventos `video.asset.ready`, `video.asset.errored`, `video.asset.deleted`, `video.upload.cancelled`.
- Analytics: `@mux/mux-player-react` envia Mux Data; `metadata.viewer_user_id` recebe hash do `userId`.
- **Env:** `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE` (base64), `MUX_WEBHOOK_SECRET`, `NEXT_PUBLIC_MUX_ENV_KEY` (somente Mux Data; única pública).

## 6. Variáveis de ambiente (resumo)

| Variável                                    | Embed   | Cloudflare          | Mux        | Pública? |
| ------------------------------------------- | ------- | ------------------- | ---------- | -------- |
| `VIDEO_PROVIDER`                            | `embed` | `cloudflare_stream` | `mux`      | não      |
| `CLOUDFLARE_ACCOUNT_ID`                     | —       | obrig.              | —          | não      |
| `CLOUDFLARE_STREAM_API_TOKEN`               | —       | obrig.              | —          | não      |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE`           | —       | obrig.              | —          | não      |
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID` / `_PEM` | —       | p/ premium          | —          | não      |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET`          | —       | p/ webhook          | —          | não      |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`         | —       | —                   | obrig.     | não      |
| `MUX_SIGNING_KEY_ID` / `_PRIVATE`           | —       | —                   | p/ premium | não      |
| `MUX_WEBHOOK_SECRET`                        | —       | —                   | p/ webhook | não      |
| `NEXT_PUBLIC_MUX_ENV_KEY`                   | —       | —                   | opcional   | sim      |

Chaves ficam só em `.env.local`/Vercel; `.env.example` lista nomes com valores vazios.

## 7. Rotas do app

- `POST /api/video/playback` — server action: checa plano simulado do usuário (RLS) e chama `getPlaybackSource`.
- `POST /api/video/upload` — portal do criador: `createUploadUrl`, grava `media` com `status: "uploading"`.
- `POST /api/webhooks/video/{kind}` — `handleWebhook`, atualiza `media.status`; responde 200 mesmo para `ignored`.

## 8. Testes

- Unit (vitest): cada adapter com env vazio retorna `missing-keys`; JWT dos stubs validado contra fixtures; `handleWebhook` rejeita assinatura inválida.
- E2E (Playwright): player de embed renderiza iframe com `title` e `allow` corretos; axe sem violações.
