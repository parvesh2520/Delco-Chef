import type { BookableService, DietType, MealType, ServiceType, UserRole } from '../types';

export const APP_CONFIG = {
  name: 'Delco Chefs',
  tagline: 'Convenience Personified.',
  version: '1.0.0',
  /**
   * From EXPO_PUBLIC_API_URL: mobile/.env for local development, eas.json for preview/production builds (EAS does not
   * upload the git-ignored .env). The emulator fallback applies to development only, never to a release build.
   */
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://10.0.2.2:8000/api/v1' : ''),
  environment: process.env.EXPO_PUBLIC_APP_ENV || 'development',
  /** Google Maps via react-native-maps. Requires GOOGLE_MAPS_API_KEY at build time (app.config.js). */
  mapsEnabled: process.env.EXPO_PUBLIC_MAPS_ENABLED !== 'false',
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

/** Weekday chips for Custom Time (numbering used by the API: Monday = 0). */
export const WEEKDAYS = [
  { value: '0', label: 'Mon' }, { value: '1', label: 'Tue' }, { value: '2', label: 'Wed' }, { value: '3', label: 'Thu' },
  { value: '4', label: 'Fri' }, { value: '5', label: 'Sat' }, { value: '6', label: 'Sun' },
];
