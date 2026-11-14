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
  expiresIn?: number;
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
  /** Landmark note for the chef (A8). */
  landmark?: string;
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
  /** Language code from GET /config `languages` (A5). */
  preferredLanguage?: string;
  diet?: DietType | null;
  cuisines?: string[];
  allergies?: string[];
  allergyNotes?: string | null;
  consentAcceptedAt?: string;
  memberSince?: string | null;
  onboarded?: boolean;
}

// ---------- Services & bookings ----------

export type ServiceType = 'monthly_subscription' | 'custom_time' | 'home_food' | 'party_mode';
/** Only these two have working booking + trial flows. */
export type BookableService = Extract<ServiceType, 'monthly_subscription' | 'custom_time'>;

export interface ServiceOffering {
  type: ServiceType;
  group?: 'subscription' | 'one_time';
  /** Signed-in customer's trial status for this service. */
  eligibility?: import('../services/booking.service').ServiceEligibility;
  name: string;
  tagline: string;
  description: string;
  available: boolean;
  priceFrom?: number;
  priceUnit?: string;
  highlights: string[];
  /** Coming-soon services only: this customer already asked to be notified (A6). */
  interested?: boolean;
}

export type DietType = 'veg' | 'non_veg' | 'eggetarian' | 'vegan' | 'jain';
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface BookingRequirements {
  members: number;
  meals: MealType[];
  /** morning | evening | both — slot times come from server settings. */
  slot: string;
  slotLabel?: string;
  startDate: string;
  endDate?: string;
  /** Custom Time only: number of days (both ends count, 7–90). */
  durationDays?: number;
  /** Custom Time only: Monday = 0 … Sunday = 6. */
  weekdays?: number[];
  hasAllergies?: boolean;
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
  /** Admin board column. */
  stage?: string;
  /** Admin: assigned chef has an off-day on an assigned visit. */
  conflict?: boolean;
  closedReason?: string;
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
  /** Exactly the choices the server will accept for this trial. */
  allowedDecisions?: TrialDecision[];
  counted?: boolean;
  pushed?: boolean;
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
  missedDays?: string[];
  /** Monthly only: flexible off-days still free in this cycle. */
  freeOffDaysLeft?: number | null;
  plannedVisits?: number;
  /** Visits of this plan the chef has completed. */
  completedVisits?: number;
  chef?: ChefCard | null;
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
  | 'pending_assignment'
  | 'missed'
  | 'cancelled'
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
  /** Four-digit code customer shares with chef at the door (customer view only, until used). */
  checkInCode?: string | null;
  startsAt?: string;
  endsAt?: string;
  allergyNotes?: string;
  /** Chef view: full address/phone only from 2h before to 2h after the visit. */
  addressRevealed?: boolean;
  codeLocked?: boolean;
  members: number;
  meals: MealType[];
  diet: DietType;
  cuisines: string[];
  allergies: string[];
  instructions?: string;
  checkInAt?: string;
  checkOutAt?: string;
  /** Customer view: the assigned chef's public profile. */
  chef?: ChefCard | null;
  /** API path of the dish photo taken at check-out (completed visits). */
  foodPhotoUrl?: string | null;
  rating?: VisitRating | null;
  canRate?: boolean;
}

export interface VisitRating {
  stars: number;
  comment?: string | null;
  createdAt: string;
}

/** Public profile of the chef assigned to a booking. */
export interface ChefCard {
  id: string;
  name: string;
  experienceYears: number;
  cuisines: string[];
  specialities?: string | null;
  rating: number;
  ratingCount: number;
  completedVisits: number;
  verified: boolean;
  city?: string | null;
  joinedAt?: string;
  /** API path (relative to the API base) of the chef's photo, fetched with the session token. */
  photoUrl?: string | null;
}

export interface TrackingSnapshot {
  visitId: string;
  available: boolean;
  /** Server refusal code when unavailable: TRACKING_NOT_AVAILABLE_YET | TRACKING_NOT_STARTED | TRACKING_ENDED. */
  code?: string;
  /** When the visibility window opens (TRACKING_NOT_AVAILABLE_YET only). */
  availableAt?: string;
  /** Visit status (chef_travelling while tracking is available). */
  status?: string;
  startsAt?: string;
  /** No update for longer than staleAfterSec → show "Reconnecting…"; the position is "last seen", not live. */
  stale?: boolean;
  staleAfterSec?: number;
  pollIntervalSec?: number;
  /** Why tracking is unavailable (chef not travelling, permission off…). */
  reason?: string | null;
  chefLocation?: LatLng;
  destination?: LatLng;
  /** Server-computed: straight-line distance at the admin's average speed (default 20 km/h). null when stale/unknown. */
  etaMinutes?: number | null;
  distanceKm?: number;
  accuracyM?: number | null;
  /** Chef is within the check-in radius. */
  arriving?: boolean;
  /** Time of the chef's last fix (server clock); null when none has arrived yet. */
  updatedAt: string | null;
  /** Age of that fix in seconds when the server answered. */
  ageSec?: number | null;
}

// ---------- Payments ----------

export type PaymentStatus = 'link_created' | 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'partially_refunded';

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
  amountPaise?: number;
  linkStatus?: 'active' | 'paid' | 'expired' | 'replaced' | 'cancelled' | null;
  gatewayStatus?: 'CREATED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  refundedAmount?: number;
  failureReason?: string;
  subscriptionStatus?: SubscriptionStatus;
  /** Refunds as the server tracks them: "requested" until the gateway confirms ("processed") or reports "failed". */
  refunds?: PaymentRefund[];
  /** Every link of the order, newest first. Admin views only. */
  links?: PaymentLinkHistory[];
}

export interface PaymentRefund {
  id: string;
  amount: number;
  amountPaise: number;
  status: 'requested' | 'processed' | 'failed' | 'flagged';
  reason: string;
  requestedAt: string;
  confirmedAt?: string | null;
}

export interface PaymentLinkHistory {
  id: string;
  status: 'active' | 'paid' | 'expired' | 'replaced' | 'cancelled';
  amount: number;
  createdAt: string;
  expiresAt: string;
  replacedAt?: string | null;
}

/** What cancelling now would refund, computed by the server (F5). */
export interface CancelPreview {
  subscriptionId: string;
  paid: boolean;
  amountPaid: number;
  refundPaise: number;
  refundAmount: number;
  fullRefund: boolean;
  firstVisitAt: string | null;
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
  allergyNotes?: string;
  respondBy?: string;
  distanceKm: number;
  members: number;
  meals: MealType[];
  diet: DietType;
  allergies: string[];
  instructions?: string;
}

/** G4 pay status of one booking: see backend services/payouts.statement. */
export type EarningStatus = 'earned' | 'pending' | 'approved' | 'paid' | 'rejected' | 'held' | 'not_payable' | 'upcoming';

export interface Earnings {
  period: string;
  cycleStart: string;
  total: number;
  visits: number;
  heldAmount: number;
  pendingPayout: number;
  statementUrl: string;
  entries: { id: string; date: string; customerName: string; kind: string; visitStatus: string; amount: number; status: EarningStatus }[];
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
  /** Points out of 100 for display; `rawScore` is the 0–1 ranking score. */
  score: number;
  rawScore?: number;
  eligible: boolean;
  /** Exclusion reasons when not eligible. */
  reasons: string[];
  /** Weighted score parts (they add up to `score`): rating + distance + workload. */
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

/** Exactly the values the server records (services/attendance.py). */
export type AttendanceException = 'missing_check_out' | 'unusual_duration' | 'customer_unavailable' | 'code_locked' | 'missed_visit';

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
  workedMinutes?: number | null;
  scheduledMinutes?: number;
  codeAttempts?: number;
  decision?: 'approved' | 'rejected' | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  /** API paths of the evidence photos (opened with the admin's token; never public URLs). */
  photos?: { checkInSelfie: string | null; checkOutSelfie: string | null; food: string | null };
  /** Detail view only: every check-in / check-out attempt as recorded by the server. */
  events?: AttendanceEvent[];
}

export interface AttendanceEvent {
  kind: string;
  result: string;
  at: string;
  accuracyM?: number | null;
  distanceM?: number | null;
  deviceId?: string | null;
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
  cycleStart: string;
  visits: number;
  amount: number;
  heldAmount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  bankReference?: string | null;
  approvedAt?: string | null;
}

export interface PayoutDetail extends Payout {
  approvedBy?: string | null;
  paidAt?: string | null;
  items: { id: string; visitId: string | null; amount: number; kind: 'visit' | 'adjustment'; note?: string | null }[];
  heldItems: { visitId: string; date: string; amount: number }[];
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
