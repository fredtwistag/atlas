import { describe, it, expect, afterEach } from "vitest";
import { validateEnv, env } from "./env";

/**
 * A complete, valid PRODUCTION env. Tests clone this and remove/poison one key
 * at a time so each assertion is about exactly one failure. The tier is keyed
 * off `NODE_ENV` IN THE PASSED OBJECT, so tests never touch the read-only
 * global `process.env.NODE_ENV`.
 */
function validProdEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    DATABASE_URL: "postgresql://u:p@host.pooler.supabase.com:6543/postgres",
    DIRECT_URL: "postgresql://u:p@host.pooler.supabase.com:5432/postgres",
    RESEND_API_KEY: "re_live_xxx",
    EMAIL_FROM: "Atlas <atlas@atlas.twistag.com>",
    ANTHROPIC_API_KEY: "sk-ant-xxx",
    APP_URL: "https://atlas.twistag.com",
  };
}

afterEach(() => {
  delete process.env.APP_URL;
});

describe("validateEnv — production tier", () => {
  it("passes with a complete prod env", () => {
    expect(() => validateEnv(validProdEnv())).not.toThrow();
  });

  it("throws naming a missing prod-only key (RESEND_API_KEY)", () => {
    const e = validProdEnv();
    delete e.RESEND_API_KEY;
    expect(() => validateEnv(e)).toThrow(/RESEND_API_KEY/);
  });

  it("throws when EMAIL_FROM uses the resend.dev sandbox sender", () => {
    const e = validProdEnv();
    e.EMAIL_FROM = "Atlas <onboarding@resend.dev>";
    expect(() => validateEnv(e)).toThrow(/EMAIL_FROM/);
    expect(() => validateEnv(e)).toThrow(/resend\.dev/);
  });

  it("rejects a non-https APP_URL", () => {
    const e = validProdEnv();
    e.APP_URL = "http://atlas.twistag.com";
    expect(() => validateEnv(e)).toThrow(/APP_URL/);
  });

  it("rejects a DATABASE_URL that is not on the :6543 pooler", () => {
    const e = validProdEnv();
    e.DATABASE_URL = "postgresql://u:p@host:5432/postgres";
    expect(() => validateEnv(e)).toThrow(/DATABASE_URL/);
  });

  it("rejects a DIRECT_URL that is not the :5432 direct connection", () => {
    const e = validProdEnv();
    e.DIRECT_URL = "postgresql://u:p@host:6543/postgres";
    expect(() => validateEnv(e)).toThrow(/DIRECT_URL/);
  });

  it("lists EVERY failing key in one error (not first-fail)", () => {
    const e = validProdEnv();
    delete e.RESEND_API_KEY;
    delete e.ANTHROPIC_API_KEY;
    delete e.APP_URL;
    let message = "";
    try {
      validateEnv(e);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/RESEND_API_KEY/);
    expect(message).toMatch(/ANTHROPIC_API_KEY/);
    expect(message).toMatch(/APP_URL/);
  });

  it("never echoes a secret value, only its name", () => {
    const e = validProdEnv();
    e.EMAIL_FROM = "Atlas <onboarding@resend.dev>";
    e.RESEND_API_KEY = "re_super_secret_value_123";
    let message = "";
    try {
      validateEnv(e);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain("re_super_secret_value_123");
  });
});

describe("validateEnv — development tier is lenient", () => {
  it("passes with only the always-required keys and none of the prod-only set", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        DATABASE_URL: "postgresql://localhost:5432/postgres",
      }),
    ).not.toThrow();
  });

  it("still throws when an always-required key is missing in dev", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        DATABASE_URL: "postgresql://localhost:5432/postgres",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("env.appUrl", () => {
  it("returns APP_URL when set", () => {
    process.env.APP_URL = "https://atlas.example.com";
    expect(env.appUrl()).toBe("https://atlas.example.com");
  });

  it("falls back to the canonical host when APP_URL is unset", () => {
    delete process.env.APP_URL;
    expect(env.appUrl()).toBe("https://atlas.twistag.com");
  });
});
