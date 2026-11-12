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

  // If token explicitly embeds tenant membership, derive strictly from token
  if (tokenTenantId) {
    const tokenMembership = active.find((m) => m.tenantId === tokenTenantId);
    if (!tokenMembership) {
      throw new Error('Mismatched tenant: token tenant is not an active membership for this identity');
    }
    if (requestedTenantId && requestedTenantId !== tokenTenantId) {
      throw new Error('Mismatched tenant: requested x-tenant-id does not match token tenant membership');
    }
    return { tenantId: tokenTenantId, subject, role: tokenMembership.role };
  }

  // If requestedTenantId is supplied in header, verify membership
  if (requestedTenantId) {
    const selected = active.find((membership) => membership.tenantId === requestedTenantId);
    if (!selected) {
      throw new Error('Mismatched tenant: requested x-tenant-id does not match token tenant membership');
    }
    return { tenantId: selected.tenantId, subject, role: selected.role };
  }

  // Derive from single active token membership
  if (active.length !== 1) {
    throw new Error(
      'Identity has multiple tenant memberships; explicit tenant selection is required'
    );
  }
  const membership = active[0];
  return { tenantId: membership.tenantId, subject, role: membership.role };
}
