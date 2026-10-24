import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export interface Session {
  login: string;
  name: string | null;
  avatar: string;
  /** GitHub access token. Only ever leaves this module inside the encrypted session cookie. */
  token: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const SESSION_COOKIE = "reproducer_session";
export const STATE_COOKIE = "reproducer_oauth_state";
const SESSION_HOURS = 7; // GitHub user tokens expire after 8 hours

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM: the cookie is both encrypted and tamper-proof. Layout: iv(12) | tag(16) | ciphertext. */
export function seal(session: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function unseal(value: string): Session | null {
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const session = JSON.parse(json) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? unseal(value) : null;
}

export async function setSession(user: Pick<Session, "login" | "name" | "avatar" | "token">): Promise<void> {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  (await cookies()).set(SESSION_COOKIE, seal({ ...user, exp }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
