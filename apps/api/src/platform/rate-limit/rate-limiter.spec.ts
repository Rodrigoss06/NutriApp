import { describe, expect, it } from 'vitest';
import { rateLimitEmail, rateLimitIp } from './rate-limiter.js';

describe('ADR-030 · claves del límite de intentos', () => {
  it('la IPv4 se usa tal cual, también envuelta en IPv6', () => {
    expect(rateLimitIp('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('la IPv6 se agrupa por /64', () => {
    expect(rateLimitIp('2001:db8:85a3:42:1:2:3:4')).toBe('2001:db8:85a3:42::/64');
    expect(rateLimitIp('2001:db8:85a3:42::ffff')).toBe('2001:db8:85a3:42::/64');
    expect(rateLimitIp('2001:db8::1')).toBe('2001:db8:0:0::/64');
  });

  it('sin IP, una clave fija; el correo sin espacios ni mayúsculas', () => {
    expect(rateLimitIp(undefined)).toBe('desconocida');
    expect(rateLimitEmail('  Ana@Demo.TEST ')).toBe('ana@demo.test');
  });
});
