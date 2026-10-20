import { describe, expect, it } from "vitest";
import { BAN_FOREVER, BAN_NONE, hasActiveAdminRole, isSuspended, restoreBanDuration, suspensionBlock } from "@/components/admin-ops/account-status";
import { isExperimentOpen, isOAuthSignupRefused, isOAuthUserBanned, isSignupRefusedByDatabase } from "@/lib/auth/experiment";
import { isAuthQueryError } from "@/lib/auth/types";

describe("isExperimentOpen", () => {
  it("setting ausente ou ilegível = aberto", () => {
    expect(isExperimentOpen(null)).toBe(true);
    expect(isExperimentOpen({})).toBe(true);
    expect(isExperimentOpen([])).toBe(true);
    expect(isExperimentOpen({ "commerce.enabled": true })).toBe(true);
  });
  it("respeita o kill switch", () => {
    expect(isExperimentOpen({ "experiment.open": true })).toBe(true);
    expect(isExperimentOpen({ "experiment.open": false })).toBe(false);
    expect(isExperimentOpen({ "experiment.open": "false" })).toBe(false);
  });
  it("mesma leitura do trigger: texto sem diferenciar maiúsculas/espaços; null = aberto", () => {
    expect(isExperimentOpen({ "experiment.open": " FALSE " })).toBe(false);
    expect(isExperimentOpen({ "experiment.open": "true" })).toBe(true);
    expect(isExperimentOpen({ "experiment.open": null })).toBe(true);
    expect(isExperimentOpen({ "experiment.open": 0 })).toBe(true);
  });
});

describe("isSignupRefusedByDatabase", () => {
  it("reconhece a recusa do trigger repassada pelo Auth", () => {
    expect(isSignupRefusedByDatabase({ status: 500, code: "unexpected_failure", message: "Database error saving new user" })).toBe(true);
    expect(isSignupRefusedByDatabase({ status: 500, message: "Database error creating new user" })).toBe(true);
    expect(isSignupRefusedByDatabase({ status: 500, code: "unexpected_failure", message: "" })).toBe(true);
    expect(isSignupRefusedByDatabase({ message: "experiment_closed" })).toBe(true);
  });
  it("ignora outros erros", () => {
    expect(isSignupRefusedByDatabase(null)).toBe(false);
    expect(isSignupRefusedByDatabase({ status: 422, code: "weak_password", message: "Password is too weak" })).toBe(false);
    expect(isSignupRefusedByDatabase({ status: 429, code: "over_email_send_rate_limit", message: "rate limit" })).toBe(false);
  });
});

describe("retorno do OAuth", () => {
  it("cadastro recusado pelo banco", () => {
    expect(isOAuthSignupRefused(new URLSearchParams("error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user"))).toBe(true);
    expect(isOAuthSignupRefused(new URLSearchParams("error=access_denied&error_description=User+cancelled"))).toBe(false);
  });
  it("conta suspensa", () => {
    expect(isOAuthUserBanned(new URLSearchParams("error=access_denied&error_code=user_banned"))).toBe(true);
    expect(isOAuthUserBanned(new URLSearchParams("error=server_error&error_code=unexpected_failure"))).toBe(false);
  });
  it("novas chaves de erro aceitas na tela de login", () => {
    expect(isAuthQueryError("experimentClosed")).toBe(true);
    expect(isAuthQueryError("accountSuspended")).toBe(true);
    expect(isAuthQueryError("experiment_closed")).toBe(false);
  });
});

describe("suspensão de conta", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("suspensa só com banned_until no futuro", () => {
    expect(isSuspended(null, now)).toBe(false);
    expect(isSuspended("2026-10-19T12:00:00Z", now)).toBe(false);
    expect(isSuspended("2126-09-26T12:00:00Z", now)).toBe(true);
    expect(isSuspended("not-a-date", now)).toBe(false);
  });
  it("detecta papel admin ativo no retorno de admin_get_user", () => {
    expect(hasActiveAdminRole([{ role: "consumer", scope_type: "global", scope_id: null }])).toBe(false);
    expect(hasActiveAdminRole([{ role: "consumer" }, { role: "admin", scope_type: "global", scope_id: null }])).toBe(true);
    expect(hasActiveAdminRole(null)).toBe(false);
    expect(hasActiveAdminRole("admin")).toBe(false);
  });
  it("bloqueia suspender a si mesmo ou um admin", () => {
    expect(suspensionBlock({ targetId: "a", actorId: "a", roles: [] })).toBe("self");
    expect(suspensionBlock({ targetId: "b", actorId: "a", roles: [{ role: "admin" }] })).toBe("admin");
    expect(suspensionBlock({ targetId: "b", actorId: "a", roles: [{ role: "consumer" }] })).toBeNull();
  });
  it("desfaz a mudança devolvendo o ban anterior", () => {
    expect(BAN_FOREVER).toBe("876000h");
    expect(restoreBanDuration(null, now)).toBe(BAN_NONE);
    expect(restoreBanDuration("2026-10-19T12:00:00Z", now)).toBe(BAN_NONE);
    expect(restoreBanDuration("2026-10-21T12:00:00Z", now)).toBe("24h");
  });
});
