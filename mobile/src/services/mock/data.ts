// In-memory sample data used while backend endpoints are unavailable.
// Mutations in services/*.ts change these arrays for the current app session only.
import type {
  Address, AdminAccount, Assignment, AssignmentHistoryEntry, AttendanceRecord, AuditLog, AppNotification,
  Chef, ChefSuggestion, CustomerProfile, Payment, Payout, ServiceOffering, ServiceRequest, SettingsSection,
  Subscription, Visit,
} from '../../types';

const day = (offset: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const dateOnly = (offset: number) => day(offset).slice(0, 10);

export const services: ServiceOffering[] = [
  {
    type: 'monthly_subscription', name: 'Monthly Subscription', tagline: 'The Delco favourite',
    description: 'For those who want hassle-free, consistent everyday meals. A verified chef cooks in your kitchen on a fixed daily slot.',
    available: true, priceFrom: 8999, priceUnit: 'per month',
    highlights: ['28 days of guaranteed service', 'Same verified chef every day', 'Free trial before you subscribe', 'Mark off-days any time'],
  },
  {
    type: 'custom_time', name: 'Custom Time', tagline: 'Flexible, shorter stints',
    description: 'For those who need peace of mind for a shorter period. Choose the number of days and your preferred slot.',
    available: true, priceFrom: 449, priceUnit: 'per visit',
    highlights: ['Choose 7 to 21 days', 'Pick your own time slot', 'Free trial before you subscribe'],
  },
  {
    type: 'home_food', name: 'Home Food', tagline: 'Coming soon',
    description: 'Home-style meals cooked by Delco chefs, delivered to your door.', available: false, highlights: [],
  },
  {
    type: 'party_mode', name: 'Party Mode', tagline: 'Coming soon',
    description: 'A gourmet experience for gatherings of 5 to 50 guests.', available: false, highlights: [],
  },
];

export const addresses: Address[] = [
  { id: 'a1', label: 'Home', line1: 'Flat 1204, Tower B, Supertech Capetown', line2: 'Sector 74', city: 'Noida', pincode: '201301', lat: 28.5733, lng: 77.3881, isDefault: true },
  { id: 'a2', label: 'Parents', line1: 'C-42, Sector 50', city: 'Noida', pincode: '201303', lat: 28.5703, lng: 77.3651, isDefault: false },
];

export const customerProfile: CustomerProfile = {
  id: 'c1', fullName: 'Aarav Sharma', phone: '9876543210', email: 'aarav@example.com', householdSize: 3, consentAcceptedAt: day(-40),
};

const baseReq = {
  members: 3, meals: ['lunch', 'dinner'] as Assignment['meals'], slot: '12:00-14:00', cuisines: ['North Indian', 'Punjabi'],
  diet: 'veg' as const, allergies: ['Peanuts'], allergyNotes: 'Child is allergic to peanuts — no groundnut oil.',
  instructions: 'Less oil, medium spice. Kitchen is on the left after entry.', addressId: 'a1',
};

export const requests: ServiceRequest[] = [
  {
    id: 'r1', customerId: 'c1', customerName: 'Aarav Sharma', customerPhone: '9876543210', service: 'monthly_subscription',
    status: 'awaiting_decision', isOpen: true, address: addresses[0], assignedChefId: 'ch1', assignedChefName: 'Sunita Devi',
    requirements: { ...baseReq, startDate: dateOnly(-3) }, createdAt: day(-5),
    trials: [{ id: 't1', requestId: 'r1', service: 'monthly_subscription', number: 1, status: 'completed', date: day(-1, 12), slot: '12:00-14:00', chefId: 'ch1', chefName: 'Sunita Devi', visitId: 'v0' }],
  },
  {
    id: 'r2', customerId: 'c1', customerName: 'Aarav Sharma', customerPhone: '9876543210', service: 'custom_time',
    status: 'converted', isOpen: false, address: addresses[0], assignedChefId: 'ch2', assignedChefName: 'Rakesh Kumar', subscriptionId: 's1',
    requirements: { ...baseReq, startDate: dateOnly(-20), durationDays: 21, meals: ['dinner'], slot: '19:00-21:00' }, createdAt: day(-25),
    trials: [
      { id: 't2', requestId: 'r2', service: 'custom_time', number: 1, status: 'completed', date: day(-23, 19), slot: '19:00-21:00', chefId: 'ch3', chefName: 'Meena Joshi', decision: 'another_trial', decidedAt: day(-23, 22) },
      { id: 't3', requestId: 'r2', service: 'custom_time', number: 2, status: 'completed', date: day(-22, 19), slot: '19:00-21:00', chefId: 'ch2', chefName: 'Rakesh Kumar', decision: 'subscribe', decidedAt: day(-22, 22) },
    ],
  },
  {
    id: 'r3', customerId: 'c2', customerName: 'Neha Verma', customerPhone: '9810012345', service: 'monthly_subscription',
    status: 'pending_assignment', isOpen: true, address: { ...addresses[1], id: 'a9', label: 'Home' },
    requirements: { ...baseReq, members: 4, diet: 'non_veg', allergies: [], allergyNotes: undefined, startDate: dateOnly(2), meals: ['breakfast', 'lunch'], slot: '07:00-09:00' },
    createdAt: day(0, 8), trials: [{ id: 't4', requestId: 'r3', service: 'monthly_subscription', number: 1, status: 'pending_assignment', date: day(2, 7), slot: '07:00-09:00' }],
  },
  {
    id: 'r4', customerId: 'c3', customerName: 'Rohit Malhotra', customerPhone: '9899011223', service: 'custom_time',
    status: 'trial_scheduled', isOpen: true, address: { ...addresses[1], id: 'a10', label: 'Home', line1: 'B-17, Sector 62' }, assignedChefId: 'ch1', assignedChefName: 'Sunita Devi',
    requirements: { ...baseReq, members: 2, durationDays: 10, startDate: dateOnly(1), allergies: ['Gluten'], allergyNotes: 'Coeliac — strictly gluten-free.' },
    createdAt: day(-1), trials: [{ id: 't5', requestId: 'r4', service: 'custom_time', number: 1, status: 'scheduled', date: day(0, 12), slot: '12:00-14:00', chefId: 'ch1', chefName: 'Sunita Devi', visitId: 'v1' }],
  },
  {
    id: 'r5', customerId: 'c4', customerName: 'Priya Nair', customerPhone: '9988776655', service: 'monthly_subscription',
    status: 'awaiting_decision', isOpen: true, address: { ...addresses[0], id: 'a11', label: 'Home', line1: 'Gaur City, 4th Avenue' }, assignedChefId: 'ch3', assignedChefName: 'Meena Joshi',
    requirements: { ...baseReq, startDate: dateOnly(-2), meals: ['dinner'] }, createdAt: day(-6),
    trials: [
      { id: 't6', requestId: 'r5', service: 'monthly_subscription', number: 1, status: 'completed', date: day(-4, 19), slot: '19:00-21:00', chefId: 'ch3', chefName: 'Meena Joshi', decision: 'another_trial', decidedAt: day(-4, 22) },
      { id: 't7', requestId: 'r5', service: 'monthly_subscription', number: 2, status: 'pending_assignment', date: day(1, 19), slot: '19:00-21:00' },
    ],
  },
];

export const subscriptions: Subscription[] = [
  { id: 's1', requestId: 'r2', service: 'custom_time', status: 'active', chefName: 'Rakesh Kumar', startDate: dateOnly(-20), endDate: dateOnly(1), slot: '19:00-21:00', meals: ['dinner'], members: 3, amount: 9429, offDays: [dateOnly(-10), dateOnly(-9)], paymentId: 'p1' },
];

const mkVisit = (v: Partial<Visit> & Pick<Visit, 'id' | 'date' | 'status'>): Visit => ({
  kind: 'subscription', refId: 's1', service: 'custom_time', slot: '19:00-21:00', chefId: 'ch1', chefName: 'Sunita Devi',
  customerName: 'Aarav Sharma', customerPhone: '9876543210', address: addresses[0], checkInCode: '4821', members: 3,
  meals: ['dinner'], diet: 'veg', cuisines: ['North Indian'], allergies: ['Peanuts'], instructions: baseReq.instructions, ...v,
});

export const visits: Visit[] = [
  mkVisit({ id: 'v1', kind: 'trial', refId: 't5', date: day(0, 12), slot: '12:00-14:00', status: 'chef_travelling', customerName: 'Rohit Malhotra', customerPhone: '9899011223', address: requests[3].address, checkInCode: '7305', members: 2, allergies: ['Gluten'] }),
  mkVisit({ id: 'v2', date: day(0, 19), status: 'scheduled', chefId: 'ch2', chefName: 'Rakesh Kumar', checkInCode: '4821' }),
  mkVisit({ id: 'v3', date: day(1, 19), status: 'scheduled', chefId: 'ch2', chefName: 'Rakesh Kumar', checkInCode: '1957' }),
  mkVisit({ id: 'v4', date: day(1, 7), slot: '07:00-09:00', status: 'scheduled', customerName: 'Kavya Iyer', customerPhone: '9811122233', checkInCode: '6620', meals: ['breakfast'] }),
  mkVisit({ id: 'v5', date: day(-2, 19), status: 'completed', chefId: 'ch2', chefName: 'Rakesh Kumar', checkInAt: day(-2, 19), checkOutAt: day(-2, 21) }),
  mkVisit({ id: 'v0', kind: 'trial', refId: 't1', service: 'monthly_subscription', date: day(-1, 12), slot: '12:00-14:00', status: 'completed', checkInAt: day(-1, 12), checkOutAt: day(-1, 14) }),
];

export const payments: Payment[] = [
  { id: 'p1', subscriptionId: 's1', customerId: 'c1', customerName: 'Aarav Sharma', service: 'custom_time', amount: 9429, status: 'paid', linkUrl: 'https://pay.example.com/l/p1', linkExpiresAt: day(-20), createdAt: day(-22), paidAt: day(-21), method: 'UPI', reference: 'UPI-48213377', attempts: 1 },
  { id: 'p2', subscriptionId: 's9', customerId: 'c5', customerName: 'Sameer Gupta', service: 'monthly_subscription', amount: 8999, status: 'link_created', linkUrl: 'https://pay.example.com/l/p2', linkExpiresAt: day(1), createdAt: day(0, 8), attempts: 0 },
  { id: 'p3', subscriptionId: 's8', customerId: 'c6', customerName: 'Ishita Rao', service: 'monthly_subscription', amount: 10499, status: 'expired', linkUrl: 'https://pay.example.com/l/p3', linkExpiresAt: day(-1), createdAt: day(-3), attempts: 1 },
  { id: 'p4', subscriptionId: 's7', customerId: 'c7', customerName: 'Vikram Singh', service: 'custom_time', amount: 4490, status: 'failed', linkUrl: 'https://pay.example.com/l/p4', linkExpiresAt: day(1), createdAt: day(-1), attempts: 2 },
];

const docs = (status: 'pending' | 'verified'): Chef['documents'] => [
  { id: 'd1', type: 'aadhaar', status, maskedValue: 'XXXX XXXX 4321', fileName: 'aadhaar.jpg', uploadedAt: day(-30) },
  { id: 'd2', type: 'pan', status, maskedValue: 'XXXXX1234X', fileName: 'pan.jpg', uploadedAt: day(-30) },
  { id: 'd3', type: 'police_verification', status, maskedValue: 'PV-••••-889', fileName: 'police.pdf', uploadedAt: day(-29) },
  { id: 'd4', type: 'photo', status, maskedValue: 'Profile photo', fileName: 'photo.jpg', uploadedAt: day(-30) },
];

export const chefs: Chef[] = [
  { id: 'ch1', name: 'Sunita Devi', phone: '9111111111', city: 'Noida', area: 'Sector 76', experienceYears: 9, cuisines: ['North Indian', 'Punjabi'], rating: 4.8, completedVisits: 412, status: 'approved', documents: docs('verified'), bank: { accountName: 'Sunita Devi', accountNumberMasked: 'XXXXXX7781', ifsc: 'HDFC0001234', upi: 'sunita@okhdfc' }, joinedAt: day(-300) },
  { id: 'ch2', name: 'Rakesh Kumar', phone: '9111111113', city: 'Noida', area: 'Sector 50', experienceYears: 6, cuisines: ['North Indian', 'Chinese'], rating: 4.6, completedVisits: 230, status: 'approved', documents: docs('verified'), joinedAt: day(-200) },
  { id: 'ch3', name: 'Meena Joshi', phone: '9111111114', city: 'Noida', area: 'Sector 62', experienceYears: 12, cuisines: ['Gujarati', 'South Indian'], rating: 4.9, completedVisits: 520, status: 'approved', documents: docs('verified'), joinedAt: day(-400) },
  { id: 'ch4', name: 'Imran Qureshi', phone: '9111111115', city: 'Noida', area: 'Sector 18', experienceYears: 4, cuisines: ['Mughlai', 'North Indian'], rating: 0, completedVisits: 0, status: 'under_review', documents: docs('pending'), joinedAt: day(-3) },
  { id: 'ch5', name: 'Lakshmi Pillai', phone: '9111111116', city: 'Noida', area: 'Sector 137', experienceYears: 7, cuisines: ['South Indian', 'Healthy / Diet'], rating: 0, completedVisits: 0, status: 'submitted', documents: docs('pending'), joinedAt: day(-1) },
];

export const suggestions: ChefSuggestion[] = [
  { chefId: 'ch1', chefName: 'Sunita Devi', rating: 4.8, experienceYears: 9, cuisines: ['North Indian', 'Punjabi'], distanceKm: 1.8, activeJobs: 2, score: 92, eligible: true, reasons: [], breakdown: { distance: 95, rating: 96, workload: 80, cuisine: 100 } },
  { chefId: 'ch3', chefName: 'Meena Joshi', rating: 4.9, experienceYears: 12, cuisines: ['Gujarati', 'South Indian'], distanceKm: 3.4, activeJobs: 1, score: 81, eligible: true, reasons: [], breakdown: { distance: 78, rating: 98, workload: 90, cuisine: 50 } },
  { chefId: 'ch2', chefName: 'Rakesh Kumar', rating: 4.6, experienceYears: 6, cuisines: ['North Indian', 'Chinese'], distanceKm: 4.9, activeJobs: 3, score: 74, eligible: true, reasons: [], breakdown: { distance: 62, rating: 92, workload: 60, cuisine: 100 } },
  { chefId: 'ch6', chefName: 'Deepak Rawat', rating: 4.5, experienceYears: 5, cuisines: ['North Indian'], distanceKm: 9.2, activeJobs: 1, score: 0, eligible: false, reasons: ['Outside assignment radius (9.2 km > 6 km)'], breakdown: { distance: 0, rating: 90, workload: 90, cuisine: 100 } },
  { chefId: 'ch7', chefName: 'Anita Bose', rating: 4.7, experienceYears: 8, cuisines: ['Bengali'], distanceKm: 2.1, activeJobs: 2, score: 0, eligible: false, reasons: ['Slot clash with existing visit (12:00–14:00)', 'Travel buffer of 30 min not met'] , breakdown: { distance: 90, rating: 94, workload: 70, cuisine: 20 } },
  { chefId: 'ch4', chefName: 'Imran Qureshi', rating: 0, experienceYears: 4, cuisines: ['Mughlai'], distanceKm: 2.6, activeJobs: 0, score: 0, eligible: false, reasons: ['Chef application not approved'], breakdown: { distance: 88, rating: 0, workload: 100, cuisine: 40 } },
  { chefId: 'ch8', chefName: 'Kiran Patel', rating: 4.4, experienceYears: 3, cuisines: ['Gujarati'], distanceKm: 3.0, activeJobs: 0, score: 0, eligible: false, reasons: ['Marked off-day on requested date'], breakdown: { distance: 80, rating: 88, workload: 100, cuisine: 30 } },
];

export const assignmentHistory: AssignmentHistoryEntry[] = [
  { id: 'h1', requestId: 'r1', chefName: 'Rakesh Kumar', action: 'assigned', by: 'Ops · Karan', at: day(-4) },
  { id: 'h2', requestId: 'r1', chefName: 'Rakesh Kumar', action: 'declined_by_chef', reason: 'Slot clash', by: 'Rakesh Kumar', at: day(-4, 11) },
  { id: 'h3', requestId: 'r1', chefName: 'Sunita Devi', action: 'reassigned', reason: 'Previous chef declined', by: 'Ops · Karan', at: day(-4, 12) },
];

export const assignments: Assignment[] = [
  { id: 'as1', requestId: 'r3', kind: 'trial', service: 'monthly_subscription', customerName: 'Neha Verma', area: 'Sector 50', date: day(2, 7), slot: '07:00-09:00', status: 'offered', distanceKm: 2.4, members: 4, meals: ['breakfast', 'lunch'], diet: 'non_veg', allergies: [] },
  { id: 'as2', requestId: 'r4', visitId: 'v1', kind: 'trial', service: 'custom_time', customerName: 'Rohit Malhotra', area: 'Sector 62', date: day(0, 12), slot: '12:00-14:00', status: 'accepted', distanceKm: 3.1, members: 2, meals: ['lunch'], diet: 'veg', allergies: ['Gluten'], instructions: 'Strictly gluten-free.' },
  { id: 'as3', requestId: 'r6', visitId: 'v4', kind: 'subscription', service: 'monthly_subscription', customerName: 'Kavya Iyer', area: 'Sector 74', date: day(1, 7), slot: '07:00-09:00', status: 'accepted', distanceKm: 1.2, members: 3, meals: ['breakfast'], diet: 'veg', allergies: ['Peanuts'] },
];

export const attendance: AttendanceRecord[] = [
  { id: 'at1', visitId: 'v5', chefName: 'Rakesh Kumar', customerName: 'Aarav Sharma', date: day(-2, 19), slot: '19:00-21:00', checkInAt: day(-2, 19), checkOutAt: day(-2, 21), checkInDistanceM: 12, checkOutDistanceM: 15, codeVerified: true, selfieCaptured: true, foodPhotoCaptured: true, status: 'ok' },
  { id: 'at2', visitId: 'v6', chefName: 'Meena Joshi', customerName: 'Priya Nair', date: day(-1, 19), slot: '19:00-21:00', checkInAt: new Date(new Date(day(-1, 19)).getTime() + 35 * 60000).toISOString(), checkOutAt: day(-1, 21), checkInDistanceM: 20, checkOutDistanceM: 18, codeVerified: true, selfieCaptured: true, foodPhotoCaptured: true, status: 'exception', exception: 'late_check_in' },
  { id: 'at3', visitId: 'v7', chefName: 'Sunita Devi', customerName: 'Kavya Iyer', date: day(-1, 7), slot: '07:00-09:00', checkInAt: day(-1, 7), checkInDistanceM: 340, codeVerified: true, selfieCaptured: true, foodPhotoCaptured: false, status: 'exception', exception: 'outside_radius' },
  { id: 'at4', visitId: 'v8', chefName: 'Rakesh Kumar', customerName: 'Sameer Gupta', date: day(-3, 12), slot: '12:00-14:00', checkInAt: day(-3, 12), codeVerified: true, selfieCaptured: true, foodPhotoCaptured: false, status: 'resolved', exception: 'missing_check_out', resolution: 'Chef phone died; customer confirmed completion.' },
];

export const admins: AdminAccount[] = [
  { id: 'ad1', name: 'Karan Mehta', phone: '9000000001', email: 'karan@delcochefs.com', role: 'ops_admin', active: true, createdAt: day(-200) },
  { id: 'ad2', name: 'Riya Kapoor', phone: '9000000002', email: 'riya@delcochefs.com', role: 'super_admin', active: true, createdAt: day(-400) },
  { id: 'ad3', name: 'Aman Gill', phone: '9000000003', email: 'aman@delcochefs.com', role: 'ops_admin', active: false, createdAt: day(-90) },
];

export const auditLogs: AuditLog[] = [
  { id: 'l1', actor: 'Riya Kapoor', actorRole: 'super_admin', action: 'Revealed document', target: 'Imran Qureshi · Aadhaar', at: day(0, 10) },
  { id: 'l2', actor: 'Karan Mehta', actorRole: 'ops_admin', action: 'Assigned chef', target: 'Request r4 → Sunita Devi', at: day(-1, 15) },
  { id: 'l3', actor: 'Riya Kapoor', actorRole: 'super_admin', action: 'Updated settings', target: 'Assignment radius 5 → 6 km', at: day(-2, 11) },
  { id: 'l4', actor: 'Karan Mehta', actorRole: 'ops_admin', action: 'Resolved attendance exception', target: 'Visit v8', at: day(-3, 18) },
  { id: 'l5', actor: 'Riya Kapoor', actorRole: 'super_admin', action: 'Created admin', target: 'Aman Gill (Ops Admin)', at: day(-90) },
];

export const payouts: Payout[] = [
  { id: 'po1', chefId: 'ch1', chefName: 'Sunita Devi', period: 'Oct 2026', visits: 52, amount: 23400, status: 'pending' },
  { id: 'po2', chefId: 'ch2', chefName: 'Rakesh Kumar', period: 'Oct 2026', visits: 41, amount: 18450, status: 'pending' },
  { id: 'po3', chefId: 'ch3', chefName: 'Meena Joshi', period: 'Sep 2026', visits: 48, amount: 21600, status: 'paid' },
];

export const settings: SettingsSection[] = [
  { key: 'pricing', title: 'Service pricing', description: 'Base prices shown to customers.', icon: 'pricetag-outline', fields: [
    { key: 'monthly_price', label: 'Monthly Subscription', value: '8999', unit: '₹ / month', keyboard: 'numeric' },
    { key: 'custom_per_visit', label: 'Custom Time', value: '449', unit: '₹ / visit', keyboard: 'numeric' },
    { key: 'extra_member', label: 'Extra member surcharge', value: '1500', unit: '₹ / month', keyboard: 'numeric' },
  ] },
  { key: 'trials', title: 'Free trials', description: 'Trial limit applies separately to each subscription service.', icon: 'gift-outline', fields: [
    { key: 'max_free_trials', label: 'Maximum free trials per service', value: '2', keyboard: 'numeric', hint: 'Trial 1: Subscribe or another trial. Last trial: Subscribe or reject.' },
  ] },
  { key: 'assignment', title: 'Assignment', description: 'Who is eligible for a request.', icon: 'navigate-outline', fields: [
    { key: 'radius_km', label: 'Assignment radius', value: '6', unit: 'km', keyboard: 'numeric' },
    { key: 'travel_buffer_min', label: 'Travel buffer between visits', value: '30', unit: 'min', keyboard: 'numeric' },
  ] },
  { key: 'ranking', title: 'Chef ranking weights', description: 'Weights must add up to 100.', icon: 'podium-outline', fields: [
    { key: 'w_distance', label: 'Distance', value: '40', unit: '%', keyboard: 'numeric' },
    { key: 'w_rating', label: 'Rating', value: '30', unit: '%', keyboard: 'numeric' },
    { key: 'w_workload', label: 'Workload', value: '15', unit: '%', keyboard: 'numeric' },
    { key: 'w_cuisine', label: 'Cuisine match', value: '15', unit: '%', keyboard: 'numeric' },
  ] },
  { key: 'check_in', title: 'Check-in rules', description: 'Geofence and time window for check-in.', icon: 'location-outline', fields: [
    { key: 'checkin_radius_m', label: 'Check-in radius', value: '150', unit: 'm', keyboard: 'numeric' },
    { key: 'window_before_min', label: 'Window opens before slot', value: '15', unit: 'min', keyboard: 'numeric' },
    { key: 'window_after_min', label: 'Late after slot start', value: '20', unit: 'min', keyboard: 'numeric' },
  ] },
  { key: 'tracking', title: 'Tracking', description: 'Live location sharing while chef travels.', icon: 'radio-outline', fields: [
    { key: 'ping_interval_s', label: 'Location update interval', value: '20', unit: 'sec', keyboard: 'numeric' },
    { key: 'visible_before_min', label: 'Visible to customer before slot', value: '60', unit: 'min', keyboard: 'numeric' },
  ] },
  { key: 'payment_link', title: 'Payment links', description: 'Validity of generated payment links.', icon: 'link-outline', fields: [
    { key: 'link_validity_h', label: 'Link validity', value: '24', unit: 'hours', keyboard: 'numeric' },
  ] },
  { key: 'slots', title: 'Slot timings', description: 'Comma-separated HH:MM-HH:MM slots.', icon: 'time-outline', fields: [
    { key: 'slots', label: 'Available slots', value: '07:00-09:00, 09:00-11:00, 12:00-14:00, 17:00-19:00, 19:00-21:00', keyboard: 'default' },
  ] },
];

export const notifications: Record<'customer' | 'chef' | 'admin', AppNotification[]> = {
  customer: [
    { id: 'n1', title: 'Trial completed', body: 'How was Sunita’s cooking? Choose to subscribe or request another trial.', at: day(-1, 15), read: false, href: '/customer/trials/t1/decision' },
    { id: 'n2', title: 'Chef on the way', body: 'Rakesh is travelling to you. Share code 4821 at the door.', at: day(0, 18), read: false, href: '/customer/visit/v2' },
    { id: 'n3', title: 'Payment received', body: '₹9,429 received for Custom Time.', at: day(-21), read: true, href: '/customer/payment/p1' },
  ],
  chef: [
    { id: 'n4', title: 'New trial assignment', body: 'Neha Verma · Sector 50 · Breakfast & lunch.', at: day(0, 9), read: false, href: '/chef/assignment/as1' },
    { id: 'n5', title: 'Visit reminder', body: 'Rohit Malhotra at 12:00. Start travel by 11:30.', at: day(0, 10), read: true, href: '/chef/job/v1' },
  ],
  admin: [
    { id: 'n6', title: 'New booking request', body: 'Neha Verma requested Monthly Subscription.', at: day(0, 8), read: false, href: '/admin/request/r3' },
    { id: 'n7', title: 'Attendance exception', body: 'Sunita Devi checked in 340 m away.', at: day(-1, 7), read: false, href: '/admin/attendance/at3' },
    { id: 'n8', title: 'Payment link expired', body: 'Ishita Rao’s link expired — regenerate.', at: day(-1), read: true, href: '/admin/payments/p3' },
  ],
};
