import { NotConfiguredError, type EmbedInfo, type MediaRef, type PlaybackOptions, type PlaybackSource, type VideoProvider } from "../types";

// Stub do Cloudflare Stream. Falha de forma explícita enquanto não houver chaves:
// nunca devolve uma URL inventada. Implementação real descrita no ADR-001 / interface.

const REQUIRED_ENV = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_STREAM_API_TOKEN", "CLOUDFLARE_STREAM_CUSTOMER_CODE"] as const;
const SIGNING_ENV = ["CLOUDFLARE_STREAM_SIGNING_KEY_ID", "CLOUDFLARE_STREAM_SIGNING_KEY_PEM"] as const;

function missing(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

export class CloudflareStreamProvider implements VideoProvider {
  readonly kind = "cloudflare-stream" as const;

  private assertConfigured(signed = false) {
    const absent = [...missing(REQUIRED_ENV), ...(signed ? missing(SIGNING_ENV) : [])];
    if (absent.length > 0) throw new NotConfiguredError(this.kind, absent);
  }

  getEmbed(_ref: MediaRef): EmbedInfo {
    void _ref;
    this.assertConfigured();
    // Com chaves presentes ainda não há implementação: mantém o erro explícito.
    throw new NotConfiguredError(this.kind, ["(implementação pendente: player Cloudflare Stream)"]);
  }

  async getPlaybackSource(_ref: MediaRef, opts: PlaybackOptions): Promise<PlaybackSource> {
    void _ref;
    this.assertConfigured(opts.signed);
    throw new NotConfiguredError(this.kind, ["(implementação pendente: manifest HLS + JWT assinado)"]);
  }
}
