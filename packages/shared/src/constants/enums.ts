export const PlatformRoleKeys = { SUPER_ADMIN: 'SUPER_ADMIN' } as const;

export const DefaultSocietyRoleKeys = {
  SOCIETY_ADMIN: 'SOCIETY_ADMIN',
  COMMITTEE: 'COMMITTEE',
  STAFF: 'STAFF',
  SECURITY_GUARD: 'SECURITY_GUARD',
  MEMBER: 'MEMBER',
} as const;

export const RoleScope = { PLATFORM: 'PLATFORM', SOCIETY: 'SOCIETY' } as const;
export type RoleScope = (typeof RoleScope)[keyof typeof RoleScope];

/** Where a role's users land after login. Drives the default UI shell. */
export const RoleLanding = { ADMIN: 'ADMIN', MEMBER: 'MEMBER', GUARD: 'GUARD', PLATFORM: 'PLATFORM' } as const;
export type RoleLanding = (typeof RoleLanding)[keyof typeof RoleLanding];

export const UserStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', INVITED: 'INVITED', LOCKED: 'LOCKED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const SocietyStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', ARCHIVED: 'ARCHIVED' } as const;
export type SocietyStatus = (typeof SocietyStatus)[keyof typeof SocietyStatus];

export const SocietyTypes = ['APARTMENT', 'VILLA', 'TOWNSHIP', 'COOPERATIVE', 'RWA', 'GATED_COMMUNITY', 'MIXED'] as const;
export type SocietyType = (typeof SocietyTypes)[number];

export const SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const BillingCycle = { MONTHLY: 'MONTHLY', ANNUAL: 'ANNUAL' } as const;
export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];

export const PlanStatus = { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' } as const;
export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

export const ModuleStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', BETA: 'BETA' } as const;
export type ModuleStatus = (typeof ModuleStatus)[keyof typeof ModuleStatus];

export const ModuleCategory = {
  CORE: 'CORE',
  COMMUNITY: 'COMMUNITY',
  FINANCE: 'FINANCE',
  OPERATIONS: 'OPERATIONS',
  COMMUNICATION: 'COMMUNICATION',
  GOVERNANCE: 'GOVERNANCE',
  REPORTS: 'REPORTS',
  SUPPORT: 'SUPPORT',
  PLATFORM: 'PLATFORM',
} as const;
export type ModuleCategory = (typeof ModuleCategory)[keyof typeof ModuleCategory];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethods = ['UPI', 'CARD', 'NETBANKING', 'WALLET', 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE', 'OTHER'] as const;
export type PaymentMethod = (typeof PaymentMethods)[number];

export const ComplaintStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
} as const;
export type ComplaintStatus = (typeof ComplaintStatus)[keyof typeof ComplaintStatus];

export const Priorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof Priorities)[number];

export const VisitorStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type VisitorStatus = (typeof VisitorStatus)[keyof typeof VisitorStatus];

export const VisitorEntryType = { PRE_APPROVED: 'PRE_APPROVED', WALK_IN: 'WALK_IN' } as const;

export const DeliveryStatus = {
  EXPECTED: 'EXPECTED',
  ARRIVED: 'ARRIVED',
  NOTIFIED: 'NOTIFIED',
  RECEIVED_AT_GATE: 'RECEIVED_AT_GATE',
  COLLECTED: 'COLLECTED',
  RETURNED: 'RETURNED',
} as const;

export const LeadTypes = ['DEMO_REQUEST', 'PLAN_ENQUIRY', 'GENERAL', 'SALES'] as const;
export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  CONVERTED: 'CONVERTED',
  CLOSED: 'CLOSED',
} as const;

export const SupportTicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING: 'WAITING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export const SupportTicketSources = ['PROSPECT', 'SOCIETY', 'SOCIETY_ADMIN', 'MEMBER'] as const;

export const NotificationChannels = ['IN_APP', 'EMAIL', 'WHATSAPP', 'PUSH'] as const;
export type NotificationChannel = (typeof NotificationChannels)[number];

export const ResidentTypes = ['OWNER', 'TENANT', 'FAMILY', 'CAREGIVER', 'OTHER'] as const;
export type ResidentType = (typeof ResidentTypes)[number];

export const ResidentStatus = { ACTIVE: 'ACTIVE', PENDING: 'PENDING', MOVED_OUT: 'MOVED_OUT', INACTIVE: 'INACTIVE' } as const;

export const UnitOccupancyStatus = ['VACANT', 'OWNER_OCCUPIED', 'TENANT_OCCUPIED', 'LOCKED'] as const;

export const ExpenseApprovalStatus = { DRAFT: 'DRAFT', PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
export const ExpensePaymentStatus = { UNPAID: 'UNPAID', PARTIAL: 'PARTIAL', PAID: 'PAID' } as const;

export const AmenityBookingStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;

export const NoticeStatus = { DRAFT: 'DRAFT', SCHEDULED: 'SCHEDULED', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' } as const;
export const AudienceTypes = ['ALL', 'BUILDING', 'UNIT_GROUP', 'ROLE', 'CUSTOM'] as const;

export const LandingSectionTypes = [
  'HERO',
  'VALUE_PROPOSITION',
  'FEATURES',
  'MODULES',
  'SECURITY',
  'HOW_IT_WORKS',
  'PRICING',
  'TESTIMONIALS',
  'FAQ',
  'CTA',
  'FOOTER',
  'CUSTOM',
] as const;
export type LandingSectionType = (typeof LandingSectionTypes)[number];

export const AssetStatus = ['PURCHASED', 'ACTIVE', 'UNDER_MAINTENANCE', 'DISPOSED'] as const;
export const ContractStatus = ['DRAFT', 'ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED'] as const;
export const StaffStatus = ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED'] as const;
export const AttendanceStatus = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'WEEK_OFF'] as const;
export const ImportJobStatus = ['UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED'] as const;
export const ImportTypes = ['BUILDINGS', 'UNITS', 'RESIDENTS', 'STAFF', 'VENDORS', 'VEHICLES', 'OPENING_BALANCES'] as const;
export type ImportType = (typeof ImportTypes)[number];

export const WorkflowKeys = {
  EXPENSE_APPROVAL: 'expense_approval',
  PURCHASE_APPROVAL: 'purchase_approval',
  VENDOR_APPROVAL: 'vendor_approval',
  AMENITY_APPROVAL: 'amenity_approval',
  DOCUMENT_APPROVAL: 'document_approval',
  MOVE_APPROVAL: 'move_approval',
} as const;

export const MeetingTypes = ['COMMITTEE', 'AGM', 'SGM', 'OTHER'] as const;
export const MeetingStatus = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const VotingTypes = ['RESOLUTION', 'ELECTION'] as const;
export const VotingStatus = ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'] as const;

/** Category types managed by the generic configurable-category engine. */
export const CategoryTypes = [
  'COMPLAINT_CATEGORY',
  'VISITOR_CATEGORY',
  'STAFF_CATEGORY',
  'VENDOR_CATEGORY',
  'EXPENSE_CATEGORY',
  'ASSET_CATEGORY',
  'INVENTORY_CATEGORY',
  'DOMESTIC_HELP_TYPE',
  'UNIT_TYPE',
  'DOCUMENT_CATEGORY',
  'FUND_TYPE',
  'INCIDENT_TYPE',
  'EVENT_TYPE',
  'AMENITY_TYPE',
  'NOTICE_CATEGORY',
  'COMMITTEE_POSITION',
] as const;
export type CategoryType = (typeof CategoryTypes)[number];
