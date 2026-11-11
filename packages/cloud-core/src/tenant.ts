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
  requestedTenantId?: string
): Promise<TenantContext> {
  if (!subject || subject.length > 255) throw new Error('Invalid authenticated subject');
  const memberships = await repository.findMembershipsBySubject(subject);
  const active = memberships.filter((membership) => membership.status === 'active');
  if (
    requestedTenantId &&
    (requestedTenantId.length > 100 || !/^[0-9a-f-]{36}$/i.test(requestedTenantId))
  ) {
    throw new Error('Invalid requested tenant ID');
  }
  if (requestedTenantId) {
    const selected = active.find((membership) => membership.tenantId === requestedTenantId);
    if (!selected) throw new Error('No active membership exists for the selected tenant');
    return { tenantId: selected.tenantId, subject, role: selected.role };
  }
  if (active.length !== 1) {
    throw new Error(
      active.length === 0
        ? 'No active tenant membership exists for this identity'
        : 'Identity has multiple tenant memberships; explicit tenant selection is required'
    );
  }
  const membership = active[0];
  return { tenantId: membership.tenantId, subject, role: membership.role };
}
