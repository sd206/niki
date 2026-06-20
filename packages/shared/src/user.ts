import { z } from 'zod';

/** Top-level user profile, stored at users/{uid}. One per Firebase Auth account. */
export const UserProfileSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  photoUrl: z.string().url().optional(),
  familyIds: z.array(z.string()).default([]),
  driveConnected: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const DriveConnectionStatusSchema = z.enum(['connected', 'disconnected', 'error']);
export type DriveConnectionStatus = z.infer<typeof DriveConnectionStatusSchema>;

/**
 * Drive connection metadata, stored at driveConnections/{uid}.
 * NOTE: refresh tokens are never stored in this document — they live in
 * Secret Manager under a per-user secret name. This doc only tracks status.
 */
export const DriveConnectionSchema = z.object({
  uid: z.string(),
  status: DriveConnectionStatusSchema,
  scopes: z.array(z.string()),
  connectedAt: z.string().optional(),
  lastSyncedAt: z.string().optional(),
});
export type DriveConnection = z.infer<typeof DriveConnectionSchema>;
