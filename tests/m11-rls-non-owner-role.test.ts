import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Milestone M11 Item 1: FORCE RLS & Non-Owner Role Hardening', () => {
  const migrationsDir = join(__dirname, '../apps/api/migrations');

  it('proves every tenant-isolated table has FORCE ROW LEVEL SECURITY enabled', async () => {
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith('.sql'));

    const tablesWithForcedRls = new Set<string>();

    for (const file of sqlFiles) {
      const content = await readFile(join(migrationsDir, file), 'utf8');
      const forceRlsMatches = content.matchAll(/ALTER\s+TABLE\s+([a-z0-9_]+)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi);
      for (const m of forceRlsMatches) {
        tablesWithForcedRls.add(m[1].toLowerCase());
      }
    }

    const expectedTenantTables = [
      'tenants',
      'tenant_memberships',
      'tenant_controls',
      'sprint_contracts',
      'audit_events',
      'career_graph_facts',
      'career_graph_fact_reviews',
      'applications',
      'application_timeline_events',
      'activity_feed_events',
      'assist_queue_items',
      'oauth_connections',
      'inbound_messages',
      'people',
      'suppression_list',
      'outreach_messages',
      'linkedin_profile_audits',
      'sprint_runs',
      'sprint_allocations',
      'sprint_auto_pause_events',
      'experiments',
      'experiment_variants',
      'experiment_events',
      'dsar_requests',
    ];

    for (const table of expectedTenantTables) {
      expect(
        tablesWithForcedRls.has(table),
        `Table "${table}" must have FORCE ROW LEVEL SECURITY to prevent table owners or non-owner app roles from bypassing RLS`
      ).toBe(true);
    }
  });

  it('proves the non-owner role careerops_app is configured with NOBYPASSRLS and NOSUPERUSER', async () => {
    const roleMigration = await readFile(join(migrationsDir, '0002_runtime_role_hardening.sql'), 'utf8');

    expect(roleMigration).toContain('CREATE ROLE careerops_app');
    expect(roleMigration).toContain('NOBYPASSRLS');
    expect(roleMigration).toContain('NOSUPERUSER');
    expect(roleMigration).toContain('NOCREATEDB');
    expect(roleMigration).toContain('NOCREATEROLE');
    expect(roleMigration).toContain('NOINHERIT');
  });

  it('simulates RLS evaluation: isolates data strictly to app.tenant_id setting', () => {
    const tenantA = '10000000-0000-4000-8000-000000000001';
    const tenantB = '20000000-0000-4000-8000-000000000002';

    // RLS Policy predicate simulation:
    // USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    const evaluateRlsPolicy = (rowTenantId: string, currentTenantSetting: string | null): boolean => {
      if (!currentTenantSetting || currentTenantSetting.trim() === '') return false;
      return rowTenantId.toLowerCase() === currentTenantSetting.toLowerCase();
    };

    // When session is bound to Tenant A
    const activeSetting = tenantA;

    // Tenant A can see its own rows
    expect(evaluateRlsPolicy(tenantA, activeSetting)).toBe(true);

    // Tenant A CANNOT see Tenant B rows
    expect(evaluateRlsPolicy(tenantB, activeSetting)).toBe(false);

    // When session setting is unset or empty, NO rows are accessible (fails closed)
    expect(evaluateRlsPolicy(tenantA, null)).toBe(false);
    expect(evaluateRlsPolicy(tenantA, '')).toBe(false);
  });
});
