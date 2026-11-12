import { describe, it, expect, beforeEach } from 'vitest';
import { useControlsStore } from '../src/store/useControlsStore';

describe('CareerOps Screen 8: Controls, Safety Caps & Privacy Store', () => {
  beforeEach(() => {
    useControlsStore.getState().resetToDefaults();
  });

  it('toggles global emergency kill switch and records rationale', async () => {
    expect(useControlsStore.getState().globalKillSwitch).toBe(false);

    await useControlsStore.getState().toggleKillSwitch(true, 'Test emergency stop');
    expect(useControlsStore.getState().globalKillSwitch).toBe(true);
    expect(useControlsStore.getState().killSwitchReason).toBe('Test emergency stop');

    await useControlsStore.getState().toggleKillSwitch(false);
    expect(useControlsStore.getState().globalKillSwitch).toBe(false);
    expect(useControlsStore.getState().killSwitchReason).toBeUndefined();
  });

  it('toggles individual channels into paused state', () => {
    expect(useControlsStore.getState().pausedChannels).toEqual([]);

    useControlsStore.getState().toggleChannel('email');
    expect(useControlsStore.getState().pausedChannels).toContain('email');

    useControlsStore.getState().toggleChannel('ats');
    expect(useControlsStore.getState().pausedChannels).toEqual(['email', 'ats']);

    // Toggling again unpauses
    useControlsStore.getState().toggleChannel('email');
    expect(useControlsStore.getState().pausedChannels).toEqual(['ats']);
  });

  it('updates daily caps and preserves integrity', () => {
    useControlsStore.getState().updateDailyCaps({ applications: 35, emails: 25 });
    const { dailyCaps } = useControlsStore.getState();

    expect(dailyCaps.applications).toBe(35);
    expect(dailyCaps.emails).toBe(25);
    expect(dailyCaps.assistQueueItems).toBe(10); // preserved default
  });

  it('clamps referral hold days strictly between 1 and 7 days', () => {
    useControlsStore.getState().updateReferralHoldDays(5);
    expect(useControlsStore.getState().referralHoldDays).toBe(5);

    // Should clamp lower bound to 1
    useControlsStore.getState().updateReferralHoldDays(-2);
    expect(useControlsStore.getState().referralHoldDays).toBe(1);

    // Should clamp upper bound to 7
    useControlsStore.getState().updateReferralHoldDays(14);
    expect(useControlsStore.getState().referralHoldDays).toBe(7);
  });

  it('manages blocklist companies with deduplication', () => {
    expect(useControlsStore.getState().blocklistCompanies).toContain('Current Employer Inc.');

    useControlsStore.getState().addBlocklistCompany('Target Rival AI');
    expect(useControlsStore.getState().blocklistCompanies).toContain('Target Rival AI');

    // Case-insensitive duplicate prevention
    const lengthBefore = useControlsStore.getState().blocklistCompanies.length;
    useControlsStore.getState().addBlocklistCompany('target rival ai');
    expect(useControlsStore.getState().blocklistCompanies.length).toBe(lengthBefore);

    useControlsStore.getState().removeBlocklistCompany('Target Rival AI');
    expect(useControlsStore.getState().blocklistCompanies).not.toContain('Target Rival AI');
  });

  it('generates structured DSAR data portability export with SHA-256 integrity checksum', async () => {
    const pkg = await useControlsStore.getState().exportDsarData();

    expect(pkg).toBeDefined();
    expect(pkg.tenantId).toBe('tenant-candidate-alpha-001');
    expect(pkg.integrityChecksumSha256).toBeDefined();
    expect(pkg.recordCounts.applications).toBeGreaterThan(0);
    expect(pkg.recordCounts.auditLogs).toBeGreaterThan(0);
  });

  it('rejects erasure if confirmation string is incorrect', async () => {
    const receipt = await useControlsStore.getState().purgeAccountData('delete please');
    expect(receipt).toBeNull();
    expect(useControlsStore.getState().errorMessage).toContain('Confirmation string did not match');
    expect(useControlsStore.getState().globalKillSwitch).toBe(false);
  });

  it('executes permanent account purge and crypto-shredding on exact confirmation phrase', async () => {
    const receipt = await useControlsStore.getState().purgeAccountData('DELETE MY ACCOUNT AND DATA');

    expect(receipt).toBeDefined();
    expect(receipt?.cryptoShreddingVerification.keyState).toBe('purged');
    expect(receipt?.cryptoShreddingVerification.sha256Proof).toBeDefined();

    // After purge, kill switch must be permanently latched and channels paused
    expect(useControlsStore.getState().globalKillSwitch).toBe(true);
    expect(useControlsStore.getState().pausedChannels.length).toBe(4);
  });
});

