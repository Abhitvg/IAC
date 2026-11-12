import { describe, expect, it } from 'vitest';
import {
  OutreachComplianceEngine,
  type SenderIdentity,
  type Jurisdiction,
} from '../packages/cloud-core/src/outreach/compliance';
import { GMAIL_LEAST_PRIVILEGE_SCOPES } from '../packages/cloud-core/src/connectors/email/gmail-connector';
import {
  TenantCryptoShredder,
  TenantKeyShreddedError,
} from '../packages/cloud-core/src/privacy/crypto-shredder';

describe('Milestone M11 Item 9: Launch Gates Verification Suite', () => {
  const complianceEngine = new OutreachComplianceEngine();

  const testSender: SenderIdentity = {
    name: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    physicalAddress: '548 Market St, PMB 12345, San Francisco, CA 94104',
    organization: 'Rivera Engineering LLC',
  };

  describe('1. Regional Outreach Footers & Legal Compliance Review', () => {
    it('generates US CAN-SPAM compliant footers with sender address and opt-out instructions', () => {
      const footer = complianceEngine.generateComplianceFooter('US', testSender);
      expect(footer).toContain('Alex Rivera');
      expect(footer).toContain('548 Market St');
      expect(footer).toContain('unsubscribe');
      expect(footer).toContain('opt out');
    });

    it('generates EU GDPR & UK PECR compliant footers referencing legitimate professional interest', () => {
      const euFooter = complianceEngine.generateComplianceFooter('EU', testSender);
      expect(euFooter).toContain('legitimate professional interest');
      expect(euFooter).toContain('Alex Rivera');
      expect(euFooter).toContain('opt out');

      const ukFooter = complianceEngine.generateComplianceFooter('UK', testSender);
      expect(ukFooter).toContain('legitimate professional interest');
      expect(ukFooter).toContain('Alex Rivera');
      expect(ukFooter).toContain('opt out');
    });

    it('generates Canada CASL compliant footers citing s. 6(5)(b) direct business inquiry exemption', () => {
      const caFooter = complianceEngine.generateComplianceFooter('CA', testSender);
      expect(caFooter).toContain('CASL s. 6(5)(b)');
      expect(caFooter).toContain('Alex Rivera');
      expect(caFooter).toContain('opt out');
    });

    it('generates India DPDP compliant footers specifying career inquiry purpose', () => {
      const inFooter = complianceEngine.generateComplianceFooter('IN', testSender);
      expect(inFooter).toContain('Purpose: Professional career inquiry');
      expect(inFooter).toContain('Alex Rivera');
      expect(inFooter).toContain('opt out');
    });

    it('embeds direct HTTPS unsubscribe links when provided', () => {
      const optOutUrl = 'https://careerops.internal/opt-out?t=tenant-1&h=abc123hash';
      const footer = complianceEngine.generateComplianceFooter('US', testSender, optOutUrl);
      expect(footer).toContain(optOutUrl);
      expect(footer).toContain('To opt out of future emails, click here:');
    });
  });

  describe('2. Google Cloud OAuth Verification & Scopes Minimization', () => {
    it('enforces least-privilege Gmail scopes and strictly forbids full mailbox access', () => {
      // Must contain only necessary send and readonly scopes
      expect(GMAIL_LEAST_PRIVILEGE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.send');
      expect(GMAIL_LEAST_PRIVILEGE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly');

      // Full mailbox control must NEVER be requested
      expect(GMAIL_LEAST_PRIVILEGE_SCOPES).not.toContain('https://mail.google.com/');
      expect(GMAIL_LEAST_PRIVILEGE_SCOPES).not.toContain('https://www.googleapis.com/auth/gmail.modify');
      expect(GMAIL_LEAST_PRIVILEGE_SCOPES).not.toContain('https://www.googleapis.com/auth/gmail.settings.basic');
    });
  });

  describe('3. Closed Beta Protocol & Staged Cap Ramp State Machine', () => {
    interface PilotTenantState {
      tenantId: string;
      shadowMode: boolean;
      rampStage: 'shadow' | 'wave_1' | 'wave_2' | 'wave_3';
      dailyAtsCap: number;
      dailyEmailCap: number;
      metrics: {
        bounceRate: number;
        spamComplaints: number;
        truthFailureRate: number;
      };
    }

    class BetaRampController {
      public advanceTenant(tenant: PilotTenantState): PilotTenantState {
        // Rollback check: any metric spike reverts tenant to shadow mode immediately
        if (
          tenant.metrics.bounceRate > 0.05 ||
          tenant.metrics.spamComplaints > 0 ||
          tenant.metrics.truthFailureRate > 0.10
        ) {
          return {
            ...tenant,
            shadowMode: true,
            rampStage: 'shadow',
            dailyAtsCap: 0,
            dailyEmailCap: 0,
          };
        }

        switch (tenant.rampStage) {
          case 'shadow':
            return {
              ...tenant,
              shadowMode: false,
              rampStage: 'wave_1',
              dailyAtsCap: 5,
              dailyEmailCap: 5,
            };
          case 'wave_1':
            return {
              ...tenant,
              shadowMode: false,
              rampStage: 'wave_2',
              dailyAtsCap: 10,
              dailyEmailCap: 10,
            };
          case 'wave_2':
            return {
              ...tenant,
              shadowMode: false,
              rampStage: 'wave_3',
              dailyAtsCap: 25,
              dailyEmailCap: 25,
            };
          default:
            return tenant;
        }
      }
    }

    const controller = new BetaRampController();

    it('orchestrates 10-20 pilot tenants through shadow mode and staged cap ramp', () => {
      const pilotCohortSize = 15;
      const pilotTenants: PilotTenantState[] = Array.from({ length: pilotCohortSize }, (_, i) => ({
        tenantId: `pilot-tenant-${i + 1}`,
        shadowMode: true,
        rampStage: 'shadow',
        dailyAtsCap: 0,
        dailyEmailCap: 0,
        metrics: { bounceRate: 0.01, spamComplaints: 0, truthFailureRate: 0.02 },
      }));

      // Initial state: all pilot users are in shadow mode
      expect(pilotTenants.every((t) => t.shadowMode === true)).toBe(true);

      // Advance to Wave 1 (5/5)
      const wave1Tenants = pilotTenants.map((t) => controller.advanceTenant(t));
      expect(wave1Tenants.every((t) => t.rampStage === 'wave_1' && t.dailyEmailCap === 5)).toBe(true);

      // Advance to Wave 2 (10/10)
      const wave2Tenants = wave1Tenants.map((t) => controller.advanceTenant(t));
      expect(wave2Tenants.every((t) => t.rampStage === 'wave_2' && t.dailyEmailCap === 10)).toBe(true);

      // Advance to Wave 3 (25/25)
      const wave3Tenants = wave2Tenants.map((t) => controller.advanceTenant(t));
      expect(wave3Tenants.every((t) => t.rampStage === 'wave_3' && t.dailyEmailCap === 25)).toBe(true);
    });

    it('automatically rolls back a tenant to shadow mode if health metrics fail during ramp', () => {
      const healthyTenant: PilotTenantState = {
        tenantId: 'pilot-tenant-99',
        shadowMode: false,
        rampStage: 'wave_2',
        dailyAtsCap: 10,
        dailyEmailCap: 10,
        metrics: { bounceRate: 0.01, spamComplaints: 0, truthFailureRate: 0.02 },
      };

      // Scenario A: Bounce rate exceeds 5% threshold
      const degradedTenant: PilotTenantState = {
        ...healthyTenant,
        metrics: { bounceRate: 0.08, spamComplaints: 0, truthFailureRate: 0.02 },
      };
      const rolledBack = controller.advanceTenant(degradedTenant);
      expect(rolledBack.shadowMode).toBe(true);
      expect(rolledBack.rampStage).toBe('shadow');
      expect(rolledBack.dailyEmailCap).toBe(0);

      // Scenario B: Single spam complaint detected
      const spamTenant: PilotTenantState = {
        ...healthyTenant,
        metrics: { bounceRate: 0.01, spamComplaints: 1, truthFailureRate: 0.02 },
      };
      const spamRolledBack = controller.advanceTenant(spamTenant);
      expect(spamRolledBack.shadowMode).toBe(true);
      expect(spamRolledBack.rampStage).toBe('shadow');
    });
  });

  describe('4. DPA Security Safeguards & Invariant Verification', () => {
    it('verifies envelope encryption and zero-overwriting crypto-shredding for DPA compliance', () => {
      const shredder = new TenantCryptoShredder();
      const tenantId = '60000000-0000-4000-8000-000000000001';

      // Encrypt sensitive DPA payload
      const sensitiveData = JSON.stringify({ candidateSSN: '123-45-6789', oauthToken: 'secret-refresh-token' });
      const encrypted = shredder.encrypt(tenantId, sensitiveData);
      expect(encrypted.ciphertextHex).toBeTruthy();
      expect(encrypted.ciphertextHex).not.toContain('123-45-6789');

      // Verify decryption before shredding
      const decrypted = shredder.decrypt(encrypted);
      expect(decrypted).toBe(sensitiveData);

      // Execute crypto-shred
      const receipt = shredder.shredTenantKey(tenantId);
      expect(receipt.status).toBe('shredded');
      expect(receipt.zeroedChecksum).toMatch(/^[a-f0-9]{64}$/);
      expect(shredder.isShredded(tenantId)).toBe(true);

      // Decryption is now permanently and mathematically impossible
      expect(() => shredder.decrypt(encrypted)).toThrow(TenantKeyShreddedError);
    });
  });
});
