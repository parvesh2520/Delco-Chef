import React from 'react';
import { Redirect, type Href } from 'expo-router';
import { useAuthStore } from '../store';
import type { Session, UserRole } from '../types';

/** Landing route for a signed-in session, honouring onboarding / chef approval state. */
export function homeFor(session: Session): Href {
  switch (session.user.role) {
    case 'customer':
      return session.onboarded ? '/customer/home' : '/customer/onboarding/profile';
    case 'chef':
      if (session.chefStatus === 'approved') return '/chef/home';
      if (session.chefStatus === 'draft') return '/chef/register';
      return '/chef/register/status';
    case 'ops_admin':
    case 'super_admin':
      return '/admin/dashboard';
  }
}

/**
 * Role guard for layouts. Returns a <Redirect/> when the current session may not
 * see this route group, otherwise null. Server must enforce the same rules.
 */
export function useRoleGuard(allowed: UserRole[]): React.ReactElement | null {
  const session = useAuthStore((s) => s.session);
  const expired = useAuthStore((s) => s.sessionExpired);
  if (!session) return <Redirect href={expired ? '/session-expired' : '/welcome'} />;
  if (!allowed.includes(session.user.role)) return <Redirect href="/access-denied" />;
  return null;
}

export const useSession = () => useAuthStore((s) => s.session);
export const useIsSuperAdmin = () => useAuthStore((s) => s.session?.user.role === 'super_admin');
