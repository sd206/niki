import { z } from 'zod';
import { RoleSchema } from './roles';

export const FamilySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  ownerId: z.string(),
  plan: z.enum(['free', 'premium', 'family_plus']).default('free'),
  createdAt: z.string(), // ISO timestamp
  updatedAt: z.string(),
});
export type Family = z.infer<typeof FamilySchema>;

export const CreateFamilyInputSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateFamilyInput = z.infer<typeof CreateFamilyInputSchema>;

export const MemberStatusSchema = z.enum(['active', 'invited', 'suspended']);
export type MemberStatus = z.infer<typeof MemberStatusSchema>;

/** A family member document, stored at families/{familyId}/members/{uid}. */
export const MemberSchema = z.object({
  uid: z.string(),
  familyId: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  photoUrl: z.string().url().optional(),
  role: RoleSchema,
  status: MemberStatusSchema,
  joinedAt: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const InviteStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked']);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

/** An invite document, stored at top-level invites/{inviteId} for easy lookup by code. */
export const InviteSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  email: z.string().email(),
  role: RoleSchema,
  invitedBy: z.string(),
  status: InviteStatusSchema,
  code: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Invite = z.infer<typeof InviteSchema>;

export const CreateInviteInputSchema = z.object({
  email: z.string().email(),
  role: RoleSchema.exclude(['owner']),
});
export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;
