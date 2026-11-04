import { describe, it, expect } from 'vitest';
import {
  isPrivateOrReservedIp,
  parseIpv4ToOctets,
  parseIpv6ToHextets,
  isPrivateOrReservedIpv4,
  isPrivateOrReservedIpv6,
} from '../electron/services/safeConnectionFetcher';
import { validateSafeFetchPinnedIpc } from '../electron/services/security';

describe('Authoritative IANA IP Range Validation & Formats (P0)', () => {
  describe('IPv4 Address Encodings and Parser', () => {
    it('parses standard 4-part dotted decimal', () => {
      expect(parseIpv4ToOctets('127.0.0.1')).toEqual([127, 0, 0, 1]);
      expect(parseIpv4ToOctets('192.168.1.254')).toEqual([192, 168, 1, 254]);
    });

    it('parses hex octets', () => {
      expect(parseIpv4ToOctets('0x7f.0.0.1')).toEqual([127, 0, 0, 1]);
      expect(parseIpv4ToOctets('0x7f.0x00.0x00.0x01')).toEqual([127, 0, 0, 1]);
    });

    it('parses octal octets', () => {
      expect(parseIpv4ToOctets('0177.0.0.1')).toEqual([127, 0, 0, 1]);
      expect(parseIpv4ToOctets('012.0.0.1')).toEqual([10, 0, 0, 1]);
    });

    it('parses single 32-bit integer formats', () => {
      // 2130706433 is 127.0.0.1
      expect(parseIpv4ToOctets('2130706433')).toEqual([127, 0, 0, 1]);
      // 0x7f000001 is 127.0.0.1
      expect(parseIpv4ToOctets('0x7f000001')).toEqual([127, 0, 0, 1]);
    });

    it('parses 2-part and 3-part dotted formats', () => {
      // 127.1 -> A=127, B=1 (24-bit) -> 127.0.0.1
      expect(parseIpv4ToOctets('127.1')).toEqual([127, 0, 0, 1]);
      // 10.0.1 -> A=10, B=0, C=1 (16-bit) -> 10.0.0.1
      expect(parseIpv4ToOctets('10.0.1')).toEqual([10, 0, 0, 1]);
    });

    it('rejects invalid IPv4 formats', () => {
      expect(parseIpv4ToOctets('')).toBeNull();
      expect(parseIpv4ToOctets('256.0.0.1')).toBeNull();
      expect(parseIpv4ToOctets('1.2.3.4.5')).toBeNull();
      expect(parseIpv4ToOctets('abc.def.ghi.jkl')).toBeNull();
      expect(parseIpv4ToOctets('-1.0.0.1')).toBeNull();
    });
  });

  describe('IPv4 Table-Driven Special-Purpose Range Enforcement (IANA / RFC 6890)', () => {
    const tableCases: Array<{ ip: string; name: string; shouldBlock: boolean }> = [
      { ip: '0.0.0.0', name: 'This host on this network (RFC 1122)', shouldBlock: true },
      { ip: '0.255.255.255', name: 'This host broadcast (RFC 1122)', shouldBlock: true },
      { ip: '10.0.0.1', name: 'Private-Use Class A (RFC 1918)', shouldBlock: true },
      { ip: '10.255.255.254', name: 'Private-Use Class A Upper (RFC 1918)', shouldBlock: true },
      { ip: '100.64.0.1', name: 'Shared Address Space / CGNAT Lower (RFC 6598)', shouldBlock: true },
      { ip: '100.127.255.255', name: 'Shared Address Space / CGNAT Upper (RFC 6598)', shouldBlock: true },
      { ip: '100.128.0.1', name: 'Public address adjacent to CGNAT', shouldBlock: false },
      { ip: '127.0.0.1', name: 'Loopback standard (RFC 1122)', shouldBlock: true },
      { ip: '127.255.255.255', name: 'Loopback upper boundary (RFC 1122)', shouldBlock: true },
      { ip: '169.254.0.1', name: 'Link-Local Lower (RFC 3927)', shouldBlock: true },
      { ip: '169.254.169.254', name: 'Link-Local AWS/Cloud Metadata (RFC 3927)', shouldBlock: true },
      { ip: '169.254.255.255', name: 'Link-Local Upper (RFC 3927)', shouldBlock: true },
      { ip: '172.16.0.1', name: 'Private-Use Class B Lower (RFC 1918)', shouldBlock: true },
      { ip: '172.31.255.255', name: 'Private-Use Class B Upper (RFC 1918)', shouldBlock: true },
      { ip: '172.32.0.1', name: 'Public address adjacent to Class B', shouldBlock: false },
      { ip: '192.0.0.1', name: 'IETF Protocol Assignments (RFC 6890)', shouldBlock: true },
      { ip: '192.0.2.1', name: 'TEST-NET-1 (RFC 5737)', shouldBlock: true },
      { ip: '192.88.99.1', name: '6to4 Relay Anycast (RFC 7526)', shouldBlock: true },
      { ip: '192.168.0.1', name: 'Private-Use Class C Lower (RFC 1918)', shouldBlock: true },
      { ip: '192.168.255.254', name: 'Private-Use Class C Upper (RFC 1918)', shouldBlock: true },
      { ip: '198.18.0.1', name: 'Benchmarking Lower (RFC 2544)', shouldBlock: true },
      { ip: '198.19.255.255', name: 'Benchmarking Upper (RFC 2544)', shouldBlock: true },
      { ip: '198.51.100.1', name: 'TEST-NET-2 (RFC 5737)', shouldBlock: true },
      { ip: '203.0.113.1', name: 'TEST-NET-3 (RFC 5737)', shouldBlock: true },
      { ip: '224.0.0.1', name: 'Multicast Class D (RFC 5771)', shouldBlock: true },
      { ip: '239.255.255.255', name: 'Multicast Class D Upper (RFC 5771)', shouldBlock: true },
      { ip: '240.0.0.1', name: 'Reserved for Future Use Class E (RFC 1112)', shouldBlock: true },
      { ip: '255.255.255.255', name: 'Limited Broadcast (RFC 8190)', shouldBlock: true },
      { ip: '93.184.216.34', name: 'Example.com Public Global IP', shouldBlock: false },
      { ip: '8.8.8.8', name: 'Google DNS Public Global IP', shouldBlock: false },
      { ip: '1.1.1.1', name: 'Cloudflare Public Global IP', shouldBlock: false },
    ];

    for (const testCase of tableCases) {
      it(`evaluates ${testCase.ip} (${testCase.name}) correctly`, () => {
        expect(isPrivateOrReservedIp(testCase.ip)).toBe(testCase.shouldBlock);
      });
    }
  });

  describe('IPv6 Table-Driven Special-Purpose Range Enforcement (IANA / RFC 6890 / RFC 4291)', () => {
    const v6Cases: Array<{ ip: string; name: string; shouldBlock: boolean }> = [
      { ip: '::', name: 'Unspecified Address (RFC 4291)', shouldBlock: true },
      { ip: '::1', name: 'Loopback Address (RFC 4291)', shouldBlock: true },
      { ip: '0:0:0:0:0:0:0:1', name: 'Full Loopback Representation', shouldBlock: true },
      { ip: '::ffff:127.0.0.1', name: 'IPv4-mapped Loopback', shouldBlock: true },
      { ip: '::ffff:169.254.169.254', name: 'IPv4-mapped AWS Metadata', shouldBlock: true },
      { ip: '::ffff:10.0.0.1', name: 'IPv4-mapped Private Class A', shouldBlock: true },
      { ip: '::ffff:0:0', name: 'IPv4-translated Lower (RFC 6052)', shouldBlock: true },
      { ip: '64:ff9b::192.0.2.1', name: 'IPv4/IPv6 translation (RFC 6052)', shouldBlock: true },
      { ip: '64:ff9b:1::1', name: 'Local-Use IPv4/IPv6 translation (RFC 8215)', shouldBlock: true },
      { ip: '100::1', name: 'Discard-Only Prefix (RFC 6666)', shouldBlock: true },
      { ip: '2001::1', name: 'Teredo prefix (RFC 4380)', shouldBlock: true },
      { ip: '2001:2::1', name: 'Benchmarking prefix (RFC 5180)', shouldBlock: true },
      { ip: '2001:10::1', name: 'ORCHID prefix (RFC 4843)', shouldBlock: true },
      { ip: '2001:20::1', name: 'ORCHIDv2 prefix (RFC 7343)', shouldBlock: true },
      { ip: '2001:db8::1', name: 'Documentation prefix (RFC 3849)', shouldBlock: true },
      { ip: '2002:7f00:1::1', name: '6to4 prefix with embedded loopback', shouldBlock: true },
      { ip: 'fc00::1', name: 'Unique Local Address (ULA) Lower (RFC 4193)', shouldBlock: true },
      { ip: 'fd12:3456:789a:1::1', name: 'Unique Local Address (ULA) Custom', shouldBlock: true },
      { ip: 'fe80::1', name: 'Link-Local Unicast (RFC 4291)', shouldBlock: true },
      { ip: 'fe80::1%eth0', name: 'Link-Local with Zone Identifier', shouldBlock: true },
      { ip: 'ff02::1', name: 'Multicast All-Nodes (RFC 4291)', shouldBlock: true },
      { ip: '2607:f8b0:4005:805::200e', name: 'Public Global IPv6 (Google)', shouldBlock: false },
      { ip: '2606:4700:4700::1111', name: 'Public Global IPv6 (Cloudflare)', shouldBlock: false },
    ];

    for (const testCase of v6Cases) {
      it(`evaluates IPv6 ${testCase.ip} (${testCase.name}) correctly`, () => {
        expect(isPrivateOrReservedIp(testCase.ip)).toBe(testCase.shouldBlock);
      });
    }
  });

  describe('Privileged IPC Handler Options & Sender Validation (P0)', () => {
    const trustedAppUrl = 'http://localhost:5173';
    process.env.VITE_DEV_SERVER_URL = trustedAppUrl;
    const mockMainWindow = {
      webContents: {
        mainFrame: { parent: null, url: trustedAppUrl },
        getURL: () => trustedAppUrl,
      },
    };

    const validEvent = {
      senderFrame: mockMainWindow.webContents.mainFrame,
      sender: mockMainWindow.webContents,
    };

    it('allows valid renderer request matching allowedOrigin', () => {
      const options = {
        url: 'https://candidate-portfolio.com/projects',
        allowedOrigin: 'https://candidate-portfolio.com',
        timeoutMs: 5000,
        maxByteSize: 500000,
        maxRedirects: 3,
      };

      const validated = validateSafeFetchPinnedIpc(validEvent, options, mockMainWindow);
      expect(validated.url).toBe('https://candidate-portfolio.com/projects');
      expect(validated.allowedOrigin).toBe('https://candidate-portfolio.com');
      expect(validated.timeoutMs).toBe(5000);
      expect(validated.maxByteSize).toBe(500000);
      expect(validated.maxRedirects).toBe(3);
    });

    it('rejects unauthorized IPC sender frame', () => {
      const untrustedSenderEvent = {
        senderFrame: { parent: {} }, // Subframe / iframe
        sender: mockMainWindow.webContents,
      };

      expect(() =>
        validateSafeFetchPinnedIpc(
          untrustedSenderEvent,
          { url: 'https://example.com', allowedOrigin: 'https://example.com' },
          mockMainWindow
        )
      ).toThrow(/Unauthorized IPC sender/i);
    });

    it('rejects completely alien IPC sender with mismatched webContents', () => {
      const alienEvent = {
        senderFrame: null,
        sender: { id: 999 }, // Different webContents
      };

      expect(() =>
        validateSafeFetchPinnedIpc(
          alienEvent,
          { url: 'https://example.com', allowedOrigin: 'https://example.com' },
          mockMainWindow
        )
      ).toThrow(/Unauthorized IPC sender/i);
    });

    it('rejects missing or empty allowedOrigin', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { url: 'https://example.com' },
          mockMainWindow
        )
      ).toThrow(/allowedOrigin is required/i);

      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { url: 'https://example.com', allowedOrigin: '' },
          mockMainWindow
        )
      ).toThrow(/allowedOrigin is required/i);
    });

    it('rejects cross-origin mismatch between URL origin and allowedOrigin', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          {
            url: 'https://evil-attacker.com/page',
            allowedOrigin: 'https://candidate-site.com',
          },
          mockMainWindow
        )
      ).toThrow(/Cross-origin fetch blocked/i);
    });

    it('rejects URLs containing embedded user credentials', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          {
            url: 'https://admin:secret@candidate-site.com/private',
            allowedOrigin: 'https://candidate-site.com',
          },
          mockMainWindow
        )
      ).toThrow(/embedded credentials/i);
    });

    it('safely clamps out-of-bounds parameters within strict production bounds', () => {
      const options = {
        url: 'https://candidate-site.com/about',
        allowedOrigin: 'https://candidate-site.com',
        timeoutMs: 9999999, // Should clamp to 30000
        maxByteSize: 100000000, // Should clamp to 5MB (5242880)
        maxRedirects: 50, // Should clamp to 10
      };

      const validated = validateSafeFetchPinnedIpc(validEvent, options, mockMainWindow);
      expect(validated.timeoutMs).toBe(30000);
      expect(validated.maxByteSize).toBe(5 * 1024 * 1024);
      expect(validated.maxRedirects).toBe(10);
    });
  });
});
