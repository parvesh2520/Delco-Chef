import type { BookableService, DietType, MealType, ServiceType, UserRole } from '../types';

export const APP_CONFIG = {
  name: 'Delco Chefs',
  tagline: 'Convenience Personified.',
  version: '1.0.0',
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000/api/v1',
  environment: process.env.EXPO_PUBLIC_APP_ENV || 'development',
  /** All service calls return mock data until the FastAPI endpoints exist. */
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS !== 'false',
} as const;

export const USER_ROLES = {
  CUSTOMER: 'customer',
  CHEF: 'chef',
  OPS_ADMIN: 'ops_admin',
  SUPER_ADMIN: 'super_admin',
} as const satisfies Record<string, UserRole>;

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Customer',
  chef: 'Chef',
  ops_admin: 'Ops Admin',
  super_admin: 'Super Admin',
};

export const BOOKABLE_SERVICES: BookableService[] = ['monthly_subscription', 'custom_time'];

export const isBookable = (s: string): s is BookableService =>
  (BOOKABLE_SERVICES as string[]).includes(s);

export const SERVICE_LABELS: Record<ServiceType, string> = {
  monthly_subscription: 'Monthly Subscription',
  custom_time: 'Custom Time',
  home_food: 'Home Food',
  party_mode: 'Party Mode',
};

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export const DIET_LABELS: Record<DietType, string> = {
  veg: 'Vegetarian',
  non_veg: 'Non-vegetarian',
  eggetarian: 'Eggetarian',
  vegan: 'Vegan',
  jain: 'Jain',
};

export const CUISINES = ['North Indian', 'South Indian', 'Bengali', 'Gujarati', 'Punjabi', 'Continental', 'Chinese', 'Healthy / Diet'];

export const COMMON_ALLERGENS = ['Peanuts', 'Tree nuts', 'Dairy', 'Gluten', 'Eggs', 'Soy', 'Shellfish', 'Sesame'];

export const SLOTS = ['07:00-09:00', '09:00-11:00', '12:00-14:00', '17:00-19:00', '19:00-21:00'];

/** Mock-only credentials shown on login screens. Remove with real auth. */
export const MOCK_AUTH = {
  otp: '123456',
  customerExisting: '9876543210',
  chefApproved: '9111111111',
  chefRejected: '9111111112',
  opsAdmin: '9000000001',
  superAdmin: '9000000002',
} as const;
