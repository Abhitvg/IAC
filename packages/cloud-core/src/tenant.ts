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
  repository: TenantMembershipRepository
): Promise<TenantContext> {
  if (!subject || subject.length > 255) throw new Error('Invalid authenticated subject');
  const memberships = await repository.findMembershipsBySubject(subject);
  const active = memberships.filter((membership) => membership.status === 'active');
  if (active.length !== 1) {
    throw new Error(active.length === 0
      ? 'No active tenant membership exists for this identity'
      : 'Identity has multiple tenant memberships; explicit tenant selection is required');
  }
  const membership = active[0];
  return { tenantId: membership.tenantId, subject, role: membership.role };
}
