import { NAVIGATION_GROUPS } from '@society-erp/shared';

export interface PlatformSettingDefault {
  key: string;
  value: unknown;
  group: string;
  label: string;
  description?: string;
  isPublic?: boolean;
  isSecret?: boolean;
}

/**
 * Platform settings are seeded once and afterwards edited by SUPER_ADMIN in the console.
 * Code reads them through ConfigurationService, never from constants.
 */
export const PLATFORM_SETTING_DEFAULTS: PlatformSettingDefault[] = [
  // ---- subscription rules
  { key: 'subscription.defaultTrialDays', value: 14, group: 'subscription', label: 'Default trial days' },
  { key: 'subscription.gracePeriodDays', value: 7, group: 'subscription', label: 'Grace period after renewal date (days)', description: 'ACTIVE subscriptions become PAST_DUE after the renewal date and stay there for this many days.' },
  { key: 'subscription.pastDueBehavior', value: 'READ_ONLY', group: 'subscription', label: 'Behaviour while PAST_DUE', description: 'FULL, READ_ONLY or BLOCK' },
  { key: 'subscription.expiredToSuspendedDays', value: 30, group: 'subscription', label: 'Days after expiry before suspension' },
  { key: 'subscription.trialEndBehavior', value: 'EXPIRE', group: 'subscription', label: 'What happens when a trial ends without payment', description: 'EXPIRE or PAST_DUE' },
  { key: 'subscription.reminderDays', value: [30, 15, 7, 3, 1], group: 'subscription', label: 'Renewal reminder days before expiry' },
  {
    key: 'subscription.expiryRadarBuckets',
    value: [
      { key: 'expired', label: 'Expired', from: -36500, to: -1 },
      { key: 'today', label: 'Today', from: 0, to: 0 },
      { key: '1-3', label: '1-3 days', from: 1, to: 3 },
      { key: '4-7', label: '4-7 days', from: 4, to: 7 },
      { key: '8-15', label: '8-15 days', from: 8, to: 15 },
      { key: '16-30', label: '16-30 days', from: 16, to: 30 },
    ],
    group: 'subscription',
    label: 'Expiry radar buckets',
  },
  { key: 'subscription.allowSelfServicePlanChange', value: true, group: 'subscription', label: 'Societies may change plan themselves' },
  { key: 'subscription.allowSelfServiceCancel', value: true, group: 'subscription', label: 'Societies may cancel themselves' },
  // ---- signup
  { key: 'signup.enabled', value: true, group: 'signup', label: 'Public signup enabled', isPublic: true },
  { key: 'signup.requireEmailVerification', value: false, group: 'signup', label: 'Require email verification' },
  { key: 'signup.defaultPlanSlug', value: 'starter', group: 'signup', label: 'Default plan for signup', isPublic: true },
  // ---- navigation
  { key: 'navigation.groups', value: NAVIGATION_GROUPS, group: 'navigation', label: 'Navigation groups (label, order, audience)' },
  // ---- brand & website (public)
  { key: 'brand.name', value: 'Society ERP', group: 'brand', label: 'Brand name', isPublic: true },
  { key: 'brand.tagline', value: 'The configurable operating system for housing societies', group: 'brand', label: 'Tagline', isPublic: true },
  { key: 'brand.logoUrl', value: '', group: 'brand', label: 'Logo URL', isPublic: true },
  { key: 'brand.faviconUrl', value: '', group: 'brand', label: 'Favicon URL', isPublic: true },
  { key: 'brand.primaryColor', value: '#4f46e5', group: 'brand', label: 'Primary colour', isPublic: true },
  { key: 'brand.accentColor', value: '#0ea5e9', group: 'brand', label: 'Accent colour', isPublic: true },
  {
    key: 'landing.contact',
    value: { email: 'hello@societyerp.local', phone: '+91 90000 00000', address: 'Bengaluru, India', hours: 'Mon-Sat, 9am-7pm IST' },
    group: 'website',
    label: 'Contact details',
    isPublic: true,
  },
  {
    key: 'landing.social',
    value: { twitter: '', linkedin: '', facebook: '', instagram: '', youtube: '' },
    group: 'website',
    label: 'Social links',
    isPublic: true,
  },
  {
    key: 'landing.footer',
    value: {
      text: 'Built for RWAs, apartment complexes, gated communities and townships.',
      columns: [
        { title: 'Product', links: [{ label: 'Features', href: '/#features' }, { label: 'Pricing', href: '/pricing' }, { label: 'Security', href: '/#security' }] },
        { title: 'Company', links: [{ label: 'Contact', href: '/contact' }, { label: 'Request a demo', href: '/contact?type=DEMO_REQUEST' }] },
        { title: 'Account', links: [{ label: 'Login', href: '/login' }, { label: 'Start free trial', href: '/signup' }] },
      ],
      legal: '© Society ERP. All rights reserved.',
    },
    group: 'website',
    label: 'Footer',
    isPublic: true,
  },
  {
    key: 'landing.seo',
    value: { title: 'Society ERP - Housing Society Management Software', description: 'Billing, accounting, visitors, complaints, amenities and governance for housing societies, RWAs and townships.', ogImage: '', keywords: 'society management, RWA software, apartment ERP' },
    group: 'website',
    label: 'SEO',
    isPublic: true,
  },
  {
    key: 'landing.cta',
    value: { primaryLabel: 'Start free trial', primaryHref: '/signup', secondaryLabel: 'Request a demo', secondaryHref: '/contact?type=DEMO_REQUEST' },
    group: 'website',
    label: 'Global call to action',
    isPublic: true,
  },
  { key: 'landing.pricing', value: { showAnnualDiscount: true, annualDiscountLabel: 'Save 2 months', currencySymbol: '₹', note: 'Prices exclude GST. Cancel anytime.' }, group: 'website', label: 'Pricing display', isPublic: true },
  // ---- security
  { key: 'security.inviteExpiryDays', value: 7, group: 'security', label: 'Invitation validity (days)' },
  { key: 'security.passwordResetExpiryMinutes', value: 30, group: 'security', label: 'Password reset validity (minutes)' },
  { key: 'security.maxSessionsPerUser', value: 10, group: 'security', label: 'Maximum concurrent sessions per user' },
  // ---- emergency (copied into every new society; editable per society afterwards)
  {
    key: 'emergency.defaultContacts',
    value: [
      { name: 'National emergency helpline', phone: '112', category: 'POLICE', notes: 'Police, fire and ambulance (India)', order: 10 },
      { name: 'Police', phone: '100', category: 'POLICE', order: 20 },
      { name: 'Fire brigade', phone: '101', category: 'FIRE', order: 30 },
      { name: 'Ambulance', phone: '108', category: 'AMBULANCE', order: 40 },
      { name: 'Women helpline', phone: '1091', category: 'POLICE', order: 50 },
      { name: 'Disaster management', phone: '1078', category: 'OTHER', order: 60 },
    ],
    group: 'emergency',
    label: 'Default emergency contacts for new societies',
  },
  // ---- support
  { key: 'support.slaHours', value: { LOW: 72, NORMAL: 48, HIGH: 24, CRITICAL: 4 }, group: 'support', label: 'Support SLA (hours) by priority' },
  { key: 'support.autoAssignUserId', value: null, group: 'support', label: 'Auto-assign new tickets to platform user' },
  // ---- notifications
  { key: 'notifications.defaultChannels', value: { IN_APP: true, EMAIL: true, WHATSAPP: false, PUSH: true }, group: 'notifications', label: 'Default notification channels' },
  // ---- platform
  { key: 'platform.currency', value: 'INR', group: 'platform', label: 'Platform currency', isPublic: true },
  { key: 'platform.timezone', value: 'Asia/Kolkata', group: 'platform', label: 'Platform timezone' },
  { key: 'platform.supportEmail', value: 'support@societyerp.local', group: 'platform', label: 'Support email', isPublic: true },
  { key: 'platform.memberSupportEnabled', value: true, group: 'platform', label: 'Members may raise platform support tickets' },
  { key: 'platform.maintenanceMode', value: false, group: 'platform', label: 'Maintenance mode (blocks society logins)', isPublic: true },
];

/**
 * Society settings defaults. Values are deep-merged with the stored document so new keys can be
 * added over time without migrations.
 */
export const SOCIETY_SETTING_DEFAULTS: Record<string, unknown> = {
  'society.general': {
    financialYearStartMonth: 4,
    dateFormat: 'DD MMM YYYY',
    unitCodeFormat: '{building}-{number}',
    allowMemberDirectory: false,
  },
  'billing.config': {
    cycle: 'MONTHLY',
    dueDay: 10,
    gracePeriodDays: 5,
    penalty: { type: 'FLAT', value: 0, applyAfterDays: 0, maxAmount: null },
    invoicePrefix: 'INV',
    receiptPrefix: 'RCP',
    taxRate: 0,
    taxLabel: 'GST',
    roundOff: true,
    autoIssue: false,
    notifyOnIssue: true,
    notes: 'Please pay before the due date to avoid late fees.',
    carryForwardBalance: true,
  },
  'payments.config': {
    onlinePaymentsEnabled: false,
    allowPartialPayments: true,
    offlineMethods: ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI'],
  },
  'visitors.config': {
    passValidityHours: 24,
    passcodeLength: 6,
    requirePhoto: false,
    requireVehicleNumber: false,
    dailyGuestCap: 0,
    notifyOnCheckin: true,
    notifyOnCheckout: false,
    walkInApprovalTimeoutMinutes: 10,
    autoCheckoutHours: 12,
  },
  'delivery.config': { leaveAtGateAllowed: true, notifyOnArrival: true },
  'complaints.config': { autoCloseAfterResolvedDays: 7, allowReopenDays: 7, memberCanRate: true, defaultPriority: 'NORMAL' },
  'complaints.sla': {
    LOW: { responseMinutes: 1440, resolutionMinutes: 10080 },
    NORMAL: { responseMinutes: 240, resolutionMinutes: 2880 },
    HIGH: { responseMinutes: 60, resolutionMinutes: 1440 },
    CRITICAL: { responseMinutes: 15, resolutionMinutes: 240 },
  },
  'complaints.escalation': {
    levels: [
      { level: 1, afterMinutesPastDue: 0, notifyRoleKeys: ['COMMITTEE'], notifyUserIds: [] },
      { level: 2, afterMinutesPastDue: 1440, notifyRoleKeys: ['SOCIETY_ADMIN'], notifyUserIds: [] },
    ],
  },
  'notifications.channels': {
    IN_APP: true,
    EMAIL: true,
    WHATSAPP: false,
    PUSH: true,
    events: {},
  },
  'amenities.config': { slotMinutes: 60, maxAdvanceBookingDays: 30, maxActiveBookingsPerUnit: 3, cancellationHours: 24, paymentWindowHours: 24, blockIfDuesPending: false, lateCancellationRefundPercent: 0, minNoticeHours: 0 },
  'notices.config': { defaultChannels: ['IN_APP', 'PUSH'], defaultExpiryDays: 30, memberCanSeeArchived: false },
  'communication.config': { memberPostsEnabled: true, moderateMemberPosts: false, allowComments: true, allowReports: true },
  'events.config': { memberCanSeeAttendees: true, reminderHours: 24 },
  'privacy.config': { maskPhoneForMembers: true, maskEmailForMembers: true, showDirectoryToMembers: false, showVehicleOwnerToGuards: true },
  'residents.config': { moveApprovalRequired: true, blockMoveOutWithDues: true, allowMemberFamilyEdit: true },
  'accounting.config': { fiscalYearStartMonth: 4, autoPostInvoices: true, autoPostPayments: true, autoPostExpenses: true },
  'staff.config': { shiftGraceMinutes: 15, overtimeAfterMinutes: 540, defaultShiftKey: 'GENERAL', attendanceReminderHour: 12, shifts: [{ key: 'GENERAL', name: 'General', startTime: '09:00', endTime: '18:00' }, { key: 'MORNING', name: 'Morning', startTime: '06:00', endTime: '14:00' }, { key: 'EVENING', name: 'Evening', startTime: '14:00', endTime: '22:00' }, { key: 'NIGHT', name: 'Night', startTime: '22:00', endTime: '06:00' }] },
  'domestic_help.config': { notifyOnEntry: true, requireVerificationForEntry: false, passcodeLength: 6 },
  'contracts.config': { reminderDays: [30, 15, 7, 1], visitReminderDays: 7, defaultNoticePeriodDays: 30 },
  'assets.config': { maintenanceReminderDays: 14, warrantyReminderDays: 60, defaultLifeYears: 10 },
  'inventory.config': { lowStockAlertRoleKeys: ['SOCIETY_ADMIN'], realertAfterDays: 7, allowNegativeStock: false },
  'documents.config': { memberVisibleCategories: ['SOCIETY', 'LEGAL', 'MEETING'], signedUrlMinutes: 15, expiryReminderDays: 30, requireApprovalForStaffUploads: false },
  'voting.config': { oneVotePerUnit: true, anonymous: true, passThresholdPercent: 50, quorumPercent: 0 },
  'meetings.config': { reminderHours: 24, agmQuorumPercent: 33, memberCanSeeCommitteeMinutes: false },
  'governance.config': { handover: { active: false, startedAt: null, startedBy: null, note: '', checklist: [], completedAt: null }, showCommitteeToMembers: true },
  'dashboard.widgets': { hidden: [], order: [] },
  'emergency.config': { sosNotifyRoleKeys: ['SOCIETY_ADMIN', 'COMMITTEE', 'SECURITY_GUARD'], escalateUnacknowledgedMinutes: 5, escalationRoleKeys: ['SOCIETY_ADMIN'], broadcastActiveHours: 6, showContactsToMembers: true, memberCanRaiseSos: true },
  'security.config': { notifyRoleKeysOnCritical: ['SOCIETY_ADMIN', 'COMMITTEE'], notifyUnitOnIncident: true, autoCloseResolvedAfterDays: 7 },
};
