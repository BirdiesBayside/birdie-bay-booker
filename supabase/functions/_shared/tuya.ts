/**
 * Tuya Cloud (OpenAPI) driver for the Active Online IP68 WiFi keypad.
 *
 * The keypad is a standalone Tuya device — there is no vendor API. Everything
 * goes through the Tuya IoT Platform OpenAPI using an Access ID / Access Secret
 * from a cloud project that has the Smart Life account linked.
 *
 * Signing: HMAC-SHA256 of
 *   client_id + [access_token] + t + nonce + stringToSign
 * where stringToSign = METHOD \n SHA256(body) \n headers \n path?query
 *
 * NOTE ON CODE LENGTH: Tuya's temp-password endpoints validate the password
 * against the device's own rules. Most access-control firmware only accepts
 * 6 digits (some allow 7). 4-digit codes are usually rejected by the cloud with
 * an "illegal password" style error even though they work when programmed on
 * the keypad itself.
 */

const REGION_HOSTS: Record<string, string> = {
  us: "https://openapi.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Upper(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export interface TuyaConfig {
  accessId: string;
  accessSecret: string;
  region: string;
  deviceId: string;
}

export class TuyaClient {
  private host: string;
  private token: string | null = null;

  constructor(private cfg: TuyaConfig) {
    this.host = REGION_HOSTS[cfg.region] || REGION_HOSTS.us;
  }

  private async request<T = any>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    withToken = true,
  ): Promise<T> {
    if (withToken && !this.token) await this.authenticate();

    const t = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : "";
    const contentHash = await sha256Hex(bodyStr);
    const stringToSign = `${method}\n${contentHash}\n\n${path}`;
    const payload = `${this.cfg.accessId}${withToken ? this.token : ""}${t}${stringToSign}`;
    const sign = await hmacSha256Upper(this.cfg.accessSecret, payload);

    const headers: Record<string, string> = {
      client_id: this.cfg.accessId,
      sign,
      t,
      sign_method: "HMAC-SHA256",
      "Content-Type": "application/json",
    };
    if (withToken && this.token) headers.access_token = this.token;

    const res = await fetch(`${this.host}${path}`, {
      method,
      headers,
      body: bodyStr || undefined,
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(`Tuya ${path} failed: ${json.msg || res.status} (code ${json.code ?? "?"})`);
    }
    return json.result as T;
  }

  async authenticate(): Promise<void> {
    const result = await this.request<{ access_token: string }>(
      "GET",
      "/v1.0/token?grant_type=1",
      undefined,
      false,
    );
    this.token = result.access_token;
  }

  /** Device data-point specification — tells us which temp-password DPs exist. */
  async getSpecifications(): Promise<unknown> {
    return await this.request("GET", `/v1.0/devices/${this.cfg.deviceId}/specifications`);
  }

  async getDevice(): Promise<unknown> {
    return await this.request("GET", `/v1.0/devices/${this.cfg.deviceId}`);
  }

  /**
   * Smart-lock temp passwords must be encrypted with a one-time "ticket".
   * Flow: request a ticket -> decrypt ticket_key with the Access Secret
   * (AES-ECB) -> encrypt the plain code with that key -> send as hex.
   */
  private async getPasswordTicket(): Promise<{ ticket_id: string; ticket_key: string }> {
    return await this.request<{ ticket_id: string; ticket_key: string }>(
      "POST",
      `/v1.0/devices/${this.cfg.deviceId}/door-lock/password-ticket`,
      {},
    );
  }

  private encryptPasswordWithTicket(plain: string, ticketKey: string): string {
    const raw = decodeMaybeHexOrBase64(ticketKey);
    // ticket_key is encrypted with the Access Secret (AES-ECB, no IV).
    const secret = new TextEncoder().encode(this.cfg.accessSecret);
    const decipher = nodeCrypto.createDecipheriv(
      secret.length === 32 ? "aes-256-ecb" : "aes-128-ecb",
      secret,
      null,
    );
    decipher.setAutoPadding(false);
    const keyBuf = Buffer.concat([decipher.update(Buffer.from(raw)), decipher.final()]);
    // Strip PKCS#7 padding manually (padding is optional on some regions).
    const key = stripPkcs7(keyBuf);

    const alg =
      key.length === 32 ? "aes-256-ecb" : key.length === 24 ? "aes-192-ecb" : "aes-128-ecb";
    const cipher = nodeCrypto.createCipheriv(alg, key.subarray(0, key.length), null);
    const enc = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
    return enc.toString("hex").toUpperCase();
  }

  /**
   * Issue a temporary password valid for a window.
   * Uses the ticket-encrypted smart-lock endpoint (required by Tuya access
   * control keypads), then falls back to the generic DP command.
   */
  async issueTempPassword(opts: {
    code: string;
    name: string;
    effectiveTime: Date;
    invalidTime: Date;
  }): Promise<{ ref: string; via: string }> {
    const effective = Math.floor(opts.effectiveTime.getTime() / 1000);
    const invalid = Math.floor(opts.invalidTime.getTime() / 1000);

    // 1) Ticket-encrypted smart-lock temp password.
    let lockErr: Error | null = null;
    try {
      const ticket = await this.getPasswordTicket();
      const encrypted = this.encryptPasswordWithTicket(opts.code, ticket.ticket_key);
      const result = await this.request<{ id?: number | string }>(
        "POST",
        `/v1.0/devices/${this.cfg.deviceId}/door-lock/temp-password`,
        {
          name: opts.name,
          password: encrypted,
          password_type: "ticket",
          ticket_id: ticket.ticket_id,
          effective_time: effective,
          invalid_time: invalid,
          type: 0,
        },
      );
      return { ref: String(result?.id ?? opts.code), via: "door-lock/temp-password" };
    } catch (e) {
      lockErr = e as Error;
    }

    // 2) Generic data-point command fallback.
    try {
      await this.request("POST", `/v1.0/devices/${this.cfg.deviceId}/commands`, {
        commands: [
          {
            code: "unlock_temporary",
            value: JSON.stringify({
              password: opts.code,
              effective_time: effective,
              invalid_time: invalid,
              name: opts.name,
            }),
          },
        ],
      });
      return { ref: opts.code, via: "dp:unlock_temporary" };
    } catch (dpErr) {
      throw new Error(
        `Temp password not supported by this device. lock-api: ${lockErr?.message} | dp: ${(dpErr as Error).message}`,
      );
    }
  }


  async deleteTempPassword(ref: string): Promise<void> {
    try {
      await this.request(
        "DELETE",
        `/v1.0/devices/${this.cfg.deviceId}/door-lock/temp-passwords/${ref}`,
      );
    } catch {
      await this.request("POST", `/v1.0/devices/${this.cfg.deviceId}/commands`, {
        commands: [{ code: "temp_unlock_delete", value: ref }],
      });
    }
  }

  /** Momentary remote unlock — supported on virtually all Tuya keypads. */
  async unlockNow(): Promise<void> {
    await this.request("POST", `/v1.0/devices/${this.cfg.deviceId}/commands`, {
      commands: [{ code: "remote_unlock", value: true }],
    });
  }
}

export function getTuyaCredentials(): { accessId: string; accessSecret: string } | null {
  const accessId = Deno.env.get("TUYA_ACCESS_ID");
  const accessSecret = Deno.env.get("TUYA_ACCESS_SECRET");
  if (!accessId || !accessSecret) return null;
  return { accessId, accessSecret };
}
