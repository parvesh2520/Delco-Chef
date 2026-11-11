// MOCK authentication. No real OTP is sent. Replace with FastAPI endpoints:
//   POST /auth/otp/request   { phone, role }
//   POST /auth/otp/verify    { phone, code, role } -> { access_token, user, ... }
import { MOCK_AUTH } from '../constants';
import type { Session, UserRole } from '../types';
import { db, mock, mockError } from './mock';

export type LoginPortal = 'customer' | 'chef' | 'admin';

export const authService = {
  requestOtp: (phone: string, _portal: LoginPortal) => mock({ sentTo: phone, expiresInSec: 60 }),

  verifyOtp: (phone: string, code: string, portal: LoginPortal): Promise<Session> => {
    if (code !== MOCK_AUTH.otp) return mockError('Incorrect code. Please try again.');
    const now = new Date().toISOString();
    const user = (id: string, fullName: string, role: UserRole) => ({ id, fullName, phone, role, createdAt: now });

    if (portal === 'admin') {
      const admin = db.admins.find((a) => a.phone === phone && a.active);
      // Unknown numbers are not admins: caller routes to the unauthorized screen.
      if (!admin) return mockError('UNAUTHORIZED');
      return mock({ user: user(admin.id, admin.name, admin.role), token: 'mock-token' });
    }
    if (portal === 'chef') {
      const chef = db.chefs.find((c) => c.phone === phone);
      if (phone === MOCK_AUTH.chefRejected) {
        return mock({ user: user('chx', 'Applicant', 'chef'), token: 'mock-token', chefStatus: 'rejected' });
      }
      return mock({
        user: user(chef?.id ?? 'ch-new', chef?.name ?? '', 'chef'),
        token: 'mock-token',
        chefStatus: chef?.status ?? 'draft',
      });
    }
    const existing = phone === MOCK_AUTH.customerExisting;
    return mock({
      user: user(existing ? 'c1' : 'c-new', existing ? db.customerProfile.fullName : '', 'customer'),
      token: 'mock-token',
      onboarded: existing,
    });
  },

  logout: () => mock(true, 150),
};
