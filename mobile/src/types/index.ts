// Domain types shared by screens and the service layer.
// Field names are camelCase; map snake_case FastAPI payloads in the service layer.

export type UserRole = 'customer' | 'chef' | 'ops_admin' | 'super_admin';
export type AdminRole = Extract<UserRole, 'ops_admin' | 'super_admin'>;

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  role: UserRole;
  createdAt: string;
}

export interface Session {
  user: User;
  token: string;
  /** Customer: has finished profile/address/consent onboarding. */
  onboarded?: boolean;
  /** Chef: application status; only `approved` chefs get the main app. */
  chefStatus?: ChefApplicationStatus;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Address extends LatLng {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  isDefault: boolean;
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  householdSize?: number;
  consentAcceptedAt?: string;
}

// ---------- Services & bookings ----------

export type ServiceType = 'monthly_subscription' | 'custom_time' | 'home_food' | 'party_mode';
/** Only these two have working booking + trial flows. */
export type BookableService = Extract<ServiceType, 'monthly_subscription' | 'custom_time'>;

export interface ServiceOffering {
  type: ServiceType;
  name: string;
  tagline: string;
  description: string;
  available: boolean;
  priceFrom?: number;
  priceUnit?: string;
  highlights: string[];
}

export type DietType = 'veg' | 'non_veg' | 'eggetarian' | 'vegan' | 'jain';
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface BookingRequirements {
  members: number;
  meals: MealType[];
  slot: string; // e.g. "07:00-09:00"
  startDate: string;
  /** Custom Time only: number of days. */
  durationDays?: number;
  cuisines: string[];
  diet: DietType;
  dietaryNotes?: string;
  allergies: string[];
  allergyNotes?: string;
  instructions?: string;
  addressId: string;
}

export type RequestStatus =
  | 'pending_assignment'
  | 'chef_assigned'
  | 'trial_scheduled'
  | 'awaiting_decision'
  | 'awaiting_payment'
  | 'converted'
  | 'rejected'
  | 'cancelled';

export interface ServiceRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  service: BookableService;
  status: RequestStatus;
  /** Open requests block a new request for the same service. */
  isOpen: boolean;
  requirements: BookingRequirements;
  address: Address;
  trials: Trial[];
  assignedChefId?: string;
  assignedChefName?: string;
  subscriptionId?: string;
  createdAt: string;
}

export type TrialStatus = 'pending_assignment' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type TrialDecision = 'subscribe' | 'another_trial' | 'reject';

export interface Trial {
  id: string;
  requestId: string;
  service: BookableService;
  number: 1 | 2;
  status: TrialStatus;
  date: string;
  slot: string;
  chefId?: string;
  chefName?: string;
  visitId?: string;
  decision?: TrialDecision;
  decidedAt?: string;
}

export type SubscriptionStatus = 'pending_payment' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Subscription {
  id: string;
  requestId: string;
  service: BookableService;
  status: SubscriptionStatus;
  chefName?: string;
  startDate: string;
  endDate: string;
  slot: string;
  meals: MealType[];
  members: number;
  amount: number;
  offDays: string[];
  paymentId?: string;
}

/** Item in the customer's booking history. */
export interface BookingSummary {
  id: string;
  kind: 'request' | 'subscription';
  service: BookableService;
  title: string;
  status: string;
  date: string;
  amount?: number;
}

// ---------- Visits & tracking ----------

export type VisitStatus =
  | 'scheduled'
  | 'chef_travelling'
  | 'arrived'
  | 'checked_in'
  | 'cooking'
  | 'completed'
  | 'customer_unavailable';

export interface Visit {
  id: string;
  kind: 'trial' | 'subscription';
  refId: string;
  service: BookableService;
  date: string;
  slot: string;
  status: VisitStatus;
  chefId: string;
  chefName: string;
  customerName: string;
  customerPhone: string;
  address: Address;
  /** Four-digit code customer shares with chef at the door. */
  checkInCode: string;
  members: number;
  meals: MealType[];
  diet: DietType;
  cuisines: string[];
  allergies: string[];
  instructions?: string;
  checkInAt?: string;
  checkOutAt?: string;
}

export interface TrackingSnapshot {
  visitId: string;
  available: boolean;
  /** Why tracking is unavailable (chef not travelling, permission off…). */
  reason?: string;
  chefLocation?: LatLng;
  destination: LatLng;
  etaMinutes?: number;
  distanceKm?: number;
  updatedAt: string;
}

// ---------- Payments ----------

export type PaymentStatus = 'link_created' | 'pending' | 'paid' | 'failed' | 'expired';

export interface Payment {
  id: string;
  subscriptionId: string;
  customerId: string;
  customerName: string;
  service: BookableService;
  amount: number;
  status: PaymentStatus;
  linkUrl: string;
  linkExpiresAt: string;
  createdAt: string;
  paidAt?: string;
  method?: string;
  reference?: string;
  attempts: number;
}

// ---------- Chefs ----------

export type ChefApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export type ChefDocumentType = 'aadhaar' | 'pan' | 'police_verification' | 'photo' | 'food_safety';

export interface ChefDocument {
  id: string;
  type: ChefDocumentType;
  status: 'pending' | 'verified' | 'rejected';
  maskedValue: string;
  fileName: string;
  uploadedAt: string;
}

export interface BankDetails {
  accountName: string;
  accountNumberMasked: string;
  ifsc: string;
  upi?: string;
}

export interface Chef {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city: string;
  area: string;
  experienceYears: number;
  cuisines: string[];
  specialities?: string;
  rating: number;
  completedVisits: number;
  status: ChefApplicationStatus;
  rejectionReason?: string;
  documents: ChefDocument[];
  bank?: BankDetails;
  joinedAt: string;
}

export type AssignmentStatus = 'offered' | 'accepted' | 'declined' | 'expired';

/** A trial/subscription job offered to a chef. */
export interface Assignment {
  id: string;
  requestId: string;
  visitId?: string;
  kind: 'trial' | 'subscription';
  service: BookableService;
  customerName: string;
  area: string;
  date: string;
  slot: string;
  status: AssignmentStatus;
  distanceKm: number;
  members: number;
  meals: MealType[];
  diet: DietType;
  allergies: string[];
  instructions?: string;
}

export interface Earnings {
  period: string;
  total: number;
  visits: number;
  pendingPayout: number;
  entries: { id: string; date: string; customerName: string; amount: number; status: 'pending' | 'paid' }[];
}

// ---------- Admin ----------

export interface ChefSuggestion {
  chefId: string;
  chefName: string;
  rating: number;
  experienceYears: number;
  cuisines: string[];
  distanceKm: number;
  activeJobs: number;
  score: number;
  eligible: boolean;
  /** Exclusion reasons when not eligible. */
  reasons: string[];
  breakdown: { distance: number; rating: number; workload: number; cuisine: number };
}

export interface AssignmentHistoryEntry {
  id: string;
  requestId: string;
  chefName: string;
  action: 'assigned' | 'reassigned' | 'declined_by_chef';
  reason?: string;
  by: string;
  at: string;
}

export type AttendanceException = 'late_check_in' | 'outside_radius' | 'missing_check_out' | 'code_mismatch' | 'customer_unavailable';

export interface AttendanceRecord {
  id: string;
  visitId: string;
  chefName: string;
  customerName: string;
  date: string;
  slot: string;
  checkInAt?: string;
  checkOutAt?: string;
  checkInDistanceM?: number;
  checkOutDistanceM?: number;
  codeVerified: boolean;
  selfieCaptured: boolean;
  foodPhotoCaptured: boolean;
  status: 'ok' | 'exception' | 'resolved';
  exception?: AttendanceException;
  resolution?: string;
}

export interface AdminDashboardStats {
  pendingRequests: number;
  trialsToday: number;
  activeSubscriptions: number;
  pendingPayments: number;
  attendanceExceptions: number;
  pendingChefApplications: number;
}

export interface AdminAccount {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  actorRole: AdminRole;
  action: string;
  target: string;
  at: string;
}

export interface Payout {
  id: string;
  chefId: string;
  chefName: string;
  period: string;
  visits: number;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
}

export type SettingsSectionKey =
  | 'pricing'
  | 'trials'
  | 'assignment'
  | 'ranking'
  | 'check_in'
  | 'tracking'
  | 'payment_link'
  | 'slots';

export interface SettingField {
  key: string;
  label: string;
  value: string;
  unit?: string;
  keyboard: 'numeric' | 'default';
  hint?: string;
}

export interface SettingsSection {
  key: SettingsSectionKey;
  title: string;
  description: string;
  icon: string;
  fields: SettingField[];
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  /** Optional in-app route to open. */
  href?: string;
}

export interface DataExportRequest {
  id: string;
  status: 'none' | 'processing' | 'ready' | 'expired';
  requestedAt?: string;
  readyAt?: string;
  downloadUrl?: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}
