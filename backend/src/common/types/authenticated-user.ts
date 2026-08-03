import type { PlanTier, UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  authId: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
}
