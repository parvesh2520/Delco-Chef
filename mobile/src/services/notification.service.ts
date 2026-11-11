// In-app notifications stored in PostgreSQL by the backend's outbox worker. The signed-in user determines the inbox.
import type { AppNotification } from '../types';
import { api } from './api';

export type NotificationAudience = 'customer' | 'chef' | 'admin';

export const notificationService = {
  list: (_audience?: NotificationAudience) => api.get<AppNotification[]>('/notifications'),
  markAllRead: (_audience?: NotificationAudience) => api.post<void>('/notifications/read-all').then(() => true),
};
