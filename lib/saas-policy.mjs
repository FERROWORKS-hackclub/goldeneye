export function canAccessWorkspace(sessionUserId, organizationId, membership, write = false, kind = '') {
  if (!sessionUserId || !organizationId || !membership) return false;
  if (membership.userId !== sessionUserId || membership.organizationId !== organizationId) return false;
  const role = membership.role;
  if (['owner', 'admin', 'manager'].includes(role)) return true;
  if (!write) return ['member', 'finance', 'viewer'].includes(role);
  if (role === 'member') return ['projects','tasks','filament','jobs','quotes','orders','links'].includes(kind);
  if (role === 'finance') return kind === 'transactions';
  return false;
}
