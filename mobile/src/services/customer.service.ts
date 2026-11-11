// Customer profile, addresses, consent and privacy. MOCK — target endpoints noted per call.
import type { Address, CustomerProfile, DataExportRequest } from '../types';
import { db, mock, newId } from './mock';

let dataExport: DataExportRequest = { id: 'e0', status: 'none' };

export const customerService = {
  getProfile: () => mock(db.customerProfile), // GET /customers/me
  updateProfile: (p: Partial<CustomerProfile>) => mock(Object.assign(db.customerProfile, p)), // PATCH /customers/me

  listAddresses: () => mock(db.addresses), // GET /customers/me/addresses
  getAddress: (id: string) => mock(db.addresses.find((a) => a.id === id) ?? null),
  saveAddress: (a: Omit<Address, 'id'> & { id?: string }) => {
    // POST|PUT /customers/me/addresses
    if (a.isDefault) db.addresses.forEach((x) => (x.isDefault = false));
    const existing = a.id ? db.addresses.find((x) => x.id === a.id) : undefined;
    if (existing) return mock(Object.assign(existing, a));
    const created = { ...a, id: newId('a'), isDefault: a.isDefault || db.addresses.length === 0 };
    db.addresses.push(created);
    return mock(created);
  },
  deleteAddress: (id: string) => {
    const i = db.addresses.findIndex((a) => a.id === id);
    if (i >= 0) db.addresses.splice(i, 1);
    return mock(true);
  },

  acceptConsent: () => mock(Object.assign(db.customerProfile, { consentAcceptedAt: new Date().toISOString() })), // POST /customers/me/consent

  getDataExport: () => mock(dataExport), // GET /customers/me/data-export
  requestDataExport: () => {
    // POST /customers/me/data-export
    dataExport = { id: newId('e'), status: 'processing', requestedAt: new Date().toISOString() };
    return mock(dataExport);
  },
  deleteAccount: (_reason: string) => mock(true, 600), // DELETE /customers/me
};
