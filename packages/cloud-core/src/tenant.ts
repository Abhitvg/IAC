export interface TenantMembership {
  tenantId: string;
  subject: string;
  role: 'owner' | 'member';
  status: 'active' | 'suspended';
}

export interface TenantMembershipRepository {
  findMembershipsBySubject(subject: string): Promise<TenantMembership[]>;
}

export interface TenantContext {
  tenantId: string;
  subject: string;
  role: TenantMembership['role'];
}

export async function resolveTenantContext(
  subject: string,
  repository: TenantMembershipRepository,
  requestedTenantId?: string,
  tokenTenantId?: string
): Promise<TenantContext> {
  if (!subject || subject.length > 255) throw new Error('Invalid authenticated subject');
  const memberships = await repository.findMembershipsBySubject(subject);
  const active = memberships.filter((membership) => membership.status === 'active');
  if (active.length === 0) {
    throw new Error('No active tenant membership exists for this identity');
  }

  if (
    requestedTenantId &&
    (requestedTenantId.length > 100 || !/^[0-9a-f-]{36}$/i.test(requestedTenantId))
  ) {
    throw new Error('Invalid requested tenant ID');
  }

  // Derive tenant from server-side active membership.
  // If the user has an active membership matching tokenTenantId, use it;
  // otherwise, untrusted tenant claims in JWT are ignored in favor of verified memberships.
  let derivedMembership = tokenTenantId ? active.find((m) => m.tenantId === tokenTenantId) : undefined;
  if (!derivedMembership) {
    if (active.length === 1) {
      derivedMembership = active[0];
    } else if (!requestedTenantId) {
      throw new Error(
        'Identity has multiple tenant memberships; explicit tenant selection is required'
      );
    }
  }

  // If requestedTenantId is supplied in header, verify membership and ensure it matches token membership
  if (requestedTenantId) {
    const selected = active.find((membership) => membership.tenantId === requestedTenantId);
    if (!selected) {
      throw new Error(
        'Mismatched tenant: requested x-tenant-id does not match token tenant membership (user is not a member of selected tenant)'
      );
    }
    if (derivedMembership && requestedTenantId !== derivedMembership.tenantId) {
      throw new Error(
        'Mismatched tenant: requested x-tenant-id does not match token tenant membership'
      );
    }
    return { tenantId: selected.tenantId, subject, role: selected.role };
  }

  if (!derivedMembership) {
    throw new Error(
      'Identity has multiple tenant memberships; explicit tenant selection is required'
    );
  }

  return { tenantId: derivedMembership.tenantId, subject, role: derivedMembership.role };
}
