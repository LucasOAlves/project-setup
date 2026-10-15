import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// The sign-in password is never stored: APP_PASSWORD_HASH holds
// scrypt:cost:blockSize:parallelization:salt:hash, made by `npm run hash-password`.

const DEFAULT_COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;
const SHAPE = /^scrypt:(\d+):(\d+):(\d+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, { N: cost, r: blockSize, p: parallelization, maxmem: 256 * cost * blockSize }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string, options: { cost?: number } = {}): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const cost = options.cost ?? DEFAULT_COST;
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost, BLOCK_SIZE, PARALLELIZATION, KEY_LENGTH);
  return `scrypt:${cost}:${BLOCK_SIZE}:${PARALLELIZATION}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export function isPasswordHash(stored: string): boolean {
  return SHAPE.test(stored);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = stored.match(SHAPE);
  if (!match) return false;
  const [, cost, blockSize, parallelization, salt, hash] = match as unknown as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, "base64url");
  try {
    const key = await derive(password, Buffer.from(salt, "base64url"), Number(cost), Number(blockSize), Number(parallelization), expected.length);
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
