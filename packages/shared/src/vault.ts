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
 * Vault hardening pass (PHASES.md 1.D follow-up, precedes Phase 4.E).
 * `standard` is unchanged from the original MVP slice — any active member
 * can create/view. `restricted`/`secure`/`vault` are gated to role >= parent
 * (apps/api/src/routes/vault.ts) and every create/view/delete against them
 * writes a VaultAuditLogEntry below. Password protection, biometric step-up,
 * emergency access, and client-side encryption remain explicitly deferred
 * Family Plus premium-tier work — this pass only covers folder tiers + role
 * gating + audit logging, per the user's explicit scoping decision.
 */
export const VAULT_FOLDER_TYPES = ['standard', 'restricted', 'secure', 'vault'] as const;
export const VaultFolderTypeSchema = z.enum(VAULT_FOLDER_TYPES);
export type VaultFolderType = z.infer<typeof VaultFolderTypeSchema>;

/** Folder types where access is gated to role >= parent and audit-logged. */
export const HARDENED_VAULT_FOLDER_TYPES: readonly VaultFolderType[] = ['restricted', 'secure', 'vault'];

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
  folderType: VaultFolderTypeSchema.default('standard'),
  eventId: z.string().optional(),
});
export type CreateVaultItemInput = z.infer<typeof CreateVaultItemInputSchema>;

/**
 * POST /vault response. `suggestion` is present only when the created item
 * landed in the `standard` tier and its name/category matched a sensitive
 * keyword (see detectSensitiveDocument below) — the web UI offers a
 * one-time "move it?" prompt off the back of this, never auto-acted.
 */
export type CreateVaultItemResponse = {
  item: VaultItem;
  suggestion?: SensitiveDocumentSuggestion;
};

/**
 * One entry per access (view list / create / delete) against a
 * restricted/secure/vault item — never written for 'standard' items, to
 * keep this collection from growing unboundedly for everyday use. Stored at
 * families/{familyId}/vaultAuditLog/{id}. Read-only from the API's
 * perspective (no update/delete endpoint) — an audit trail that could be
 * edited or erased isn't a trail.
 */
export const VAULT_AUDIT_ACTIONS = ['view', 'create', 'delete', 'move'] as const;
export const VaultAuditActionSchema = z.enum(VAULT_AUDIT_ACTIONS);
export type VaultAuditAction = z.infer<typeof VaultAuditActionSchema>;

export const VaultAuditLogEntrySchema = z.object({
  id: z.string(),
  familyId: z.string(),
  vaultItemId: z.string(),
  vaultItemName: z.string(),
  folderType: VaultFolderTypeSchema,
  action: VaultAuditActionSchema,
  actorUid: z.string(),
  timestamp: z.string(),
});
export type VaultAuditLogEntry = z.infer<typeof VaultAuditLogEntrySchema>;

/** Allows changing only the folderType of an existing item (e.g. accepting a sensitive-document suggestion, or manually re-tiering). */
export const MoveVaultItemInputSchema = z.object({
  folderType: VaultFolderTypeSchema,
});
export type MoveVaultItemInput = z.infer<typeof MoveVaultItemInputSchema>;

/**
 * Phase 4.E (Security monitoring) — sensitive-document detection.
 * Deliberately deterministic, not LLM-based: vault item names are short
 * (<=200 chars) and the signal is just "does this name/category suggest a
 * sensitive document," which a keyword match handles reliably and
 * instantly, without an AI infra dependency or the latency/cost of a model
 * call on every vault create. This mirrors the "deterministic where
 * possible" principle from Phase 4.C/4.D.
 *
 * Per explicit user scoping: this only ever *suggests* moving a newly
 * created `standard`-tier item to a hardened tier — it never moves
 * anything automatically. The suggestion is surfaced once, at create time;
 * dismissing it has no persisted effect (it's not re-offered later).
 */
export const SensitiveDocumentSuggestionSchema = z.object({
  vaultItemId: z.string(),
  vaultItemName: z.string(),
  suggestedFolderType: VaultFolderTypeSchema,
  reason: z.string(),
});
export type SensitiveDocumentSuggestion = z.infer<typeof SensitiveDocumentSuggestionSchema>;

/** Keyword groups, most-sensitive tier first. First match wins. */
const SENSITIVE_KEYWORDS_BY_TIER: { folderType: VaultFolderType; keywords: string[] }[] = [
  {
    folderType: 'vault',
    keywords: ['ssn', 'social security', 'passport', 'driver license', "driver's license", 'ein', 'tax id', 'birth certificate'],
  },
  {
    folderType: 'secure',
    keywords: ['bank account', 'routing number', 'credit card', 'medical record', 'prescription', 'diagnosis', 'account number'],
  },
  {
    folderType: 'restricted',
    keywords: ['insurance policy', 'will', 'trust', 'deed', 'mortgage', 'lease', 'contract', 'tax return', 'w-2', 'w2', '1099'],
  },
];

/**
 * Returns a suggestion if `name` (or `category`) matches a sensitive
 * keyword, else null. Only meaningful for `standard`-tier items — callers
 * should only invoke this for those (see apps/api/src/routes/vault.ts).
 */
export function detectSensitiveDocument(
  vaultItemId: string,
  vaultItemName: string,
  category: VaultCategory,
): SensitiveDocumentSuggestion | null {
  const haystack = `${vaultItemName} ${category}`.toLowerCase();
  for (const { folderType, keywords } of SENSITIVE_KEYWORDS_BY_TIER) {
    const hit = keywords.find((k) => haystack.includes(k));
    if (hit) {
      return {
        vaultItemId,
        vaultItemName,
        suggestedFolderType: folderType,
        reason: `Name/category mentions "${hit}" — documents like this are commonly kept in the ${folderType} tier.`,
      };
    }
  }
  return null;
}
