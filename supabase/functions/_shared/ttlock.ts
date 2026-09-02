import { createHash } from "node:crypto";

/**
 * TTLock Cloud API driver.
 *
 * Docs: euopen.ttlock.com / open.ttlock.com
 * - Everything is POST + application/x-www-form-urlencoded
 * - `date` (current time, epoch ms) is required on every v3 call
 * - Passwords are always lowercase 32-char MD5
 * - Success is errcode 0 (or an absent errcode on data responses)
 *
 * Auth model: one OAuth2 access token per *end user account*. For a venue we
 * hold the venue's TTLock app credentials (or a cloud-only account we created
 * with `registerUser`) as project secrets and mint tokens server-side.
 */

const REGION_HOSTS: Record<string, string> = {
  eu: "https://euapi.ttlock.com",
  cn: "https://api.ttlock.com",
};

export const md5 = (s: string) => createHash("md5").update(s).digest("hex").toLowerCase();

export interface TTLockCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string; // plaintext; hashed before it leaves this module
}

export function getTTLockCredentials(): TTLockCredentials | null {
  const clientId = Deno.env.get("TTLOCK_CLIENT_ID");
  const clientSecret = Deno.env.get("TTLOCK_CLIENT_SECRET");
  const username = Deno.env.get("TTLOCK_USERNAME");
  const password = Deno.env.get("TTLOCK_PASSWORD");
  if (!clientId || !clientSecret || !username || !password) return null;
  return { clientId, clientSecret, username, password };
}

interface TokenCache {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

// Cached for the life of the isolate — a token is valid for ~90 days.
const tokenCache = new Map<string, TokenCache>();

export interface TTLockOptions extends TTLockCredentials {
  region?: string;
  lockId?: string | number | null;
}

export class TTLockClient {
  private clientId: string;
  private clientSecret: string;
  private username: string;
  private password: string;
  private host: string;
  private lockId: number | null;

  constructor(opts: TTLockOptions) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.username = opts.username;
    this.password = opts.password;
    this.host = REGION_HOSTS[opts.region || "eu"] || REGION_HOSTS.eu;
    this.lockId = opts.lockId ? Number(opts.lockId) : null;
  }

  private get cacheKey() {
    return `${this.host}|${this.clientId}|${this.username}`;
  }

  private async fetchForm(path: string, params: Record<string, string | number | undefined>) {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") body.append(k, String(v));
    }
    const res = await fetch(`${this.host}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`TTLock ${path} returned non-JSON (${res.status})`);
    }
    return json;
  }

  /** OAuth2 password grant. Cached until near expiry. */
  async getAccessToken(force = false): Promise<string> {
    const cached = tokenCache.get(this.cacheKey);
    if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

    const json = await this.fetchForm("/oauth2/token", {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      username: this.username,
      password: md5(this.password),
    });

    if (!json.access_token) {
      throw new Error(
        `TTLock login failed: ${json.errmsg || json.description || JSON.stringify(json)}`,
      );
    }
    tokenCache.set(this.cacheKey, {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (Number(json.expires_in) || 7_776_000) * 1000,
    });
    return json.access_token;
  }

  /** Authenticated v3 call with a single retry on an expired token (errcode 10004). */
  private async api(path: string, params: Record<string, string | number | undefined>) {
    const call = async (token: string) =>
      await this.fetchForm(path, {
        clientId: this.clientId,
        accessToken: token,
        date: Date.now(),
        ...params,
      });

    let json = await call(await this.getAccessToken());
    if (json?.errcode === 10004) json = await call(await this.getAccessToken(true));

    if (json?.errcode && json.errcode !== 0) {
      throw new Error(
        `TTLock ${path} error ${json.errcode}: ${json.errmsg || json.description || "unknown"}`,
      );
    }
    return json;
  }

  private requireLock(): number {
    if (!this.lockId) throw new Error("No TTLock lock ID configured");
    return this.lockId;
  }

  /** All locks visible to this account. */
  async listLocks(pageSize = 100) {
    const json = await this.api("/v3/lock/list", { pageNo: 1, pageSize });
    return json.list || [];
  }

  /** Lock detail — used as a lightweight connection test. */
  async getLock() {
    return await this.api("/v3/lock/detail", { lockId: this.requireLock() });
  }

  /**
   * Push a custom passcode to the lock through the gateway / WiFi (addType 2),
   * so no phone or Bluetooth is involved.
   *
   * keyboardPwdType 3 = period code (valid between startDate and endDate).
   */
  async issueTempPassword(opts: {
    code: string;
    name: string;
    effectiveTime: Date;
    invalidTime: Date;
  }): Promise<{ ref: string; via: string }> {
    const json = await this.api("/v3/keyboardPwd/add", {
      lockId: this.requireLock(),
      keyboardPwd: opts.code,
      keyboardPwdName: opts.name.slice(0, 30),
      keyboardPwdType: 3,
      startDate: opts.effectiveTime.getTime(),
      endDate: opts.invalidTime.getTime(),
      addType: 2,
    });
    if (!json?.keyboardPwdId) {
      throw new Error(`TTLock did not return a passcode id: ${JSON.stringify(json)}`);
    }
    return { ref: String(json.keyboardPwdId), via: "gateway" };
  }

  /** Remove a passcode from the lock via the gateway (deleteType 2). */
  async deleteTempPassword(ref: string | number) {
    await this.api("/v3/keyboardPwd/delete", {
      lockId: this.requireLock(),
      keyboardPwdId: Number(ref),
      deleteType: 2,
    });
    return true;
  }

  /** Change an existing passcode's window without changing the digits. */
  async changeTempPassword(
    ref: string | number,
    opts: { code?: string; name?: string; effectiveTime: Date; invalidTime: Date },
  ) {
    await this.api("/v3/keyboardPwd/change", {
      lockId: this.requireLock(),
      keyboardPwdId: Number(ref),
      newKeyboardPwd: opts.code,
      keyboardPwdName: opts.name?.slice(0, 30),
      startDate: opts.effectiveTime.getTime(),
      endDate: opts.invalidTime.getTime(),
      changeType: 2,
    });
    return true;
  }

  /** Everything currently programmed on the lock. */
  async listTempPasswords(pageSize = 100) {
    const json = await this.api("/v3/lock/listKeyboardPwd", {
      lockId: this.requireLock(),
      pageNo: 1,
      pageSize,
    });
    return json.list || [];
  }

  /** Remote unlock (requires a gateway / WiFi lock with remote unlock enabled). */
  async unlockNow() {
    await this.api("/v3/lock/unlock", { lockId: this.requireLock() });
    return true;
  }
}

/**
 * Create a cloud-only TTLock account underneath our developer application.
 *
 * Used when onboarding a new venue that doesn't want to hand over real TTLock
 * app credentials: TTLock returns a namespaced username (e.g. `abcd_<yours>`)
 * which must be stored and used verbatim for every future token request.
 */
export async function registerTTLockUser(opts: {
  clientId: string;
  clientSecret: string;
  username: string; // alphanumeric, no prefix
  password: string; // plaintext
  region?: string;
}): Promise<{ username: string }> {
  const host = REGION_HOSTS[opts.region || "eu"] || REGION_HOSTS.eu;
  const body = new URLSearchParams({
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    username: opts.username,
    password: md5(opts.password),
    date: String(Date.now()),
  });
  const res = await fetch(`${host}/v3/user/register`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!json?.username) {
    throw new Error(
      `TTLock user registration failed: ${json?.errmsg || json?.description || JSON.stringify(json)}`,
    );
  }
  return { username: json.username };
}
