export const APP_CONFIG = {
  name: 'Delco Chefs',
  tagline: 'Home Chef Service',
  version: '1.0.0',
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000/api/v1',
  environment: process.env.EXPO_PUBLIC_APP_ENV || 'development',
} as const;

export const USER_ROLES = {
  CUSTOMER: 'customer',
  CHEF: 'chef',
  ADMIN: 'admin',
} as const;
