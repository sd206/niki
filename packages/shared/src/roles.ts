import { z } from 'zod';

/**
 * Family member roles, per PRD "User Roles" section.
 * Ordered roughly by privilege level (owner = highest).
 */
export const RoleSchema = z.enum(['owner', 'parent', 'member', 'child', 'guest']);
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  parent: 3,
  member: 2,
  child: 1,
  guest: 0,
};

/** True if `role` has at least the privilege level of `minimum`. */
export function hasAtLeastRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
