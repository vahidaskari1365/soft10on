import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/** رمزنگاری scrypt با salt تصادفی → «salt:hash» (hex) */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

/** بررسی رمز عبور */
export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const test = scryptSync(plain, salt, 32)
    const orig = Buffer.from(hash, 'hex')
    return test.length === orig.length && timingSafeEqual(test, orig)
  } catch {
    return false
  }
}
