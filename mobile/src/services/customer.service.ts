// Customer profile, addresses, consent and privacy — all persisted by the FastAPI backend.
import type { Address, CustomerProfile, DataExportRequest } from '../types';
import { absoluteUrl, api } from './api';

export const customerService = {
  getProfile: () => api.get<CustomerProfile>('/customers/me'),
  updateProfile: (p: Partial<CustomerProfile>) => api.patch<CustomerProfile>('/customers/me', p),
  completeOnboarding: () => api.post<CustomerProfile>('/customers/me/onboarding/complete'),

  listAddresses: () => api.get<Address[]>('/customers/me/addresses'),
  getAddress: (id: string) => api.get<Address>(`/customers/me/addresses/${id}`),
  saveAddress: (a: Omit<Address, 'id'> & { id?: string }) => {
    const { id, ...body } = a;
    return id ? api.put<Address>(`/customers/me/addresses/${id}`, body) : api.post<Address>('/customers/me/addresses', body);
  },
  deleteAddress: (id: string) => api.del<void>(`/customers/me/addresses/${id}`).then(() => true),

  acceptConsent: () => api.post<CustomerProfile>('/customers/me/consent', { kinds: ['terms', 'location'] }),

  getDataExport: () =>
    api.get<DataExportRequest>('/privacy/export').then((e) => ({ ...e, downloadUrl: e.downloadUrl ? absoluteUrl(e.downloadUrl) : undefined })),
  requestDataExport: () => api.post<DataExportRequest>('/privacy/export'),
  deleteAccount: (reason: string) => api.del<void>('/customers/me', { reason }).then(() => true),
};
