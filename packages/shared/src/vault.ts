import { z } from 'zod';

/** PRD-defined vault categories, plus 'custom' for anything else. */
export const VAULT_CATEGORIES = [
  'home',
  'vehicles',
  'travel',
  'insurance',
  'taxes',
  'medical',
  'school',
  'legal',
  'financial',
  'pets',
  'custom',
] as const;
export const VaultCategorySchema = z.enum(VAULT_CATEGORIES);
export type VaultCategory = z.infer<typeof VaultCategorySchema>;

/**
 * Only 'standard' exists in this MVP slice. restricted/secure/vault tiers
 * (password protection, biometric auth, audit logs) are explicitly deferred
 * Family Plus premium-tier work per PHASES.md 1.D.
 */
export const VaultFolderTypeSchema = z.literal('standard');
export type VaultFolderType = z.infer<typeof VaultFolderTypeSchema>;

/**
 * A vault item document, stored at families/{familyId}/vaultItems/{id}.
 * Niki never touches file bytes — driveFileId/driveFileUrl are just a
 * reference to a file the user already owns in their own Google Drive,
 * picked client-side via the Google Picker API.
 */
export const VaultItemSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  name: z.string().min(1).max(200),
  driveFileId: z.string(),
  driveFileUrl: z.string(), // webViewLink from the Drive Picker response
  category: VaultCategorySchema,
  folderType: VaultFolderTypeSchema,
  // Optional link to a Phase 1.C Event (e.g. a passport scan for a trip).
  eventId: z.string().optional(),
  addedBy: z.string(),
  createdAt: z.string(),
});
export type VaultItem = z.infer<typeof VaultItemSchema>;

export const CreateVaultItemInputSchema = z.object({
  name: z.string().min(1).max(200),
  driveFileId: z.string(),
  driveFileUrl: z.string(),
  category: VaultCategorySchema.default('custom'),
  eventId: z.string().optional(),
});
export type CreateVaultItemInput = z.infer<typeof CreateVaultItemInputSchema>;
