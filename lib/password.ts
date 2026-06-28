import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  if (!hash) return false;
  const [algorithm, salt, stored] = hash.split("$");
  if (algorithm !== "scrypt" || !salt || !stored) return false;

  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(stored, "base64url");
  return storedBuffer.length === key.length && crypto.timingSafeEqual(storedBuffer, key);
}
