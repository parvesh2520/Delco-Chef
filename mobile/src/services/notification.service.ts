// In-app notification centre. MOCK — push notifications (FCM) are a later integration.
import { db, mock } from './mock';

export type NotificationAudience = keyof typeof db.notifications;

export const notificationService = {
  list: (audience: NotificationAudience) => mock(db.notifications[audience]),
  markAllRead: (audience: NotificationAudience) => {
    db.notifications[audience].forEach((n) => (n.read = true));
    return mock(true);
  },
};
