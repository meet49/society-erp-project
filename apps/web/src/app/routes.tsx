import { lazy, type LazyExoticComponent, type ComponentType } from 'react';
import { matchPath } from 'react-router-dom';

export type RouteLayout = 'public' | 'auth' | 'platform' | 'society' | 'guard';

/**
 * Centralised route configuration. It drives React Router, sidebar visibility (paths must exist
 * here to be shown), breadcrumbs / titles and UX-only permission & module gating.
 */
export interface AppRoute {
  path: string;
  element: LazyExoticComponent<ComponentType<any>>;
  layout: RouteLayout;
  title: string;
  module?: string;
  permission?: string | string[];
  /** default 'active' for society & guard layouts */
  subscriptionRequirement?: 'active' | 'none';
  parent?: string;
}

const L = (loader: () => Promise<{ default: ComponentType<any> }>) => lazy(loader);

export const routes: AppRoute[] = [
  // ---------------- public website
  { path: '/', layout: 'public', title: 'Home', element: L(() => import('@/features/public/landing-page')) },
  { path: '/pricing', layout: 'public', title: 'Pricing', element: L(() => import('@/features/public/pricing-page')) },
  { path: '/contact', layout: 'public', title: 'Contact', element: L(() => import('@/features/public/contact-page')) },

  // ---------------- auth
  { path: '/login', layout: 'auth', title: 'Sign in', element: L(() => import('@/features/auth/login-page')) },
  { path: '/signup', layout: 'auth', title: 'Create your society', element: L(() => import('@/features/auth/signup-page')) },
  { path: '/forgot-password', layout: 'auth', title: 'Forgot password', element: L(() => import('@/features/auth/forgot-password-page')) },
  { path: '/reset-password', layout: 'auth', title: 'Reset password', element: L(() => import('@/features/auth/reset-password-page')) },
  { path: '/accept-invite', layout: 'auth', title: 'Accept invitation', element: L(() => import('@/features/auth/accept-invite-page')) },
  { path: '/choose-society', layout: 'auth', title: 'Choose workspace', element: L(() => import('@/features/auth/choose-society-page')) },

  // ---------------- platform console
  { path: '/admin', layout: 'platform', title: 'Overview', permission: 'platform_dashboard:view', element: L(() => import('@/features/platform/dashboard-page')) },
  { path: '/admin/societies', layout: 'platform', title: 'Societies', permission: 'platform_societies:view', element: L(() => import('@/features/platform/societies-page')) },
  { path: '/admin/societies/:id', layout: 'platform', title: 'Society', permission: 'platform_societies:view', parent: '/admin/societies', element: L(() => import('@/features/platform/society-detail-page')) },
  { path: '/admin/subscriptions', layout: 'platform', title: 'Subscriptions', permission: 'platform_subscriptions:view', element: L(() => import('@/features/platform/subscriptions-page')) },
  { path: '/admin/subscriptions/expiry', layout: 'platform', title: 'Expiry radar', permission: 'platform_subscriptions:view', parent: '/admin/subscriptions', element: L(() => import('@/features/platform/expiry-radar-page')) },
  { path: '/admin/plans', layout: 'platform', title: 'Plans', permission: 'platform_plans:view', element: L(() => import('@/features/platform/plans-page')) },
  { path: '/admin/payments', layout: 'platform', title: 'Payments', permission: 'platform_payments:view', element: L(() => import('@/features/platform/payments-page')) },
  { path: '/admin/modules', layout: 'platform', title: 'Modules', permission: 'platform_modules:view', element: L(() => import('@/features/platform/modules-page')) },
  { path: '/admin/feature-flags', layout: 'platform', title: 'Feature flags', permission: 'platform_feature_flags:view', element: L(() => import('@/features/platform/feature-flags-page')) },
  { path: '/admin/website/landing', layout: 'platform', title: 'Landing page', permission: 'platform_landing:view', element: L(() => import('@/features/platform/website/landing-editor-page')) },
  { path: '/admin/website/pricing', layout: 'platform', title: 'Pricing display', permission: 'platform_landing:view', element: L(() => import('@/features/platform/website/pricing-settings-page')) },
  { path: '/admin/website/faqs', layout: 'platform', title: 'FAQs', permission: 'platform_landing:view', element: L(() => import('@/features/platform/website/faqs-page')) },
  { path: '/admin/website/testimonials', layout: 'platform', title: 'Testimonials', permission: 'platform_landing:view', element: L(() => import('@/features/platform/website/testimonials-page')) },
  { path: '/admin/website/settings', layout: 'platform', title: 'Brand & SEO', permission: 'platform_landing:view', element: L(() => import('@/features/platform/website/brand-page')) },
  { path: '/admin/leads', layout: 'platform', title: 'Leads', permission: 'platform_leads:view', element: L(() => import('@/features/platform/leads-page')) },
  { path: '/admin/leads/:id', layout: 'platform', title: 'Lead', permission: 'platform_leads:view', parent: '/admin/leads', element: L(() => import('@/features/platform/leads-page')) },
  { path: '/admin/support', layout: 'platform', title: 'Support inbox', permission: 'platform_support:view', element: L(() => import('@/features/platform/support-page')) },
  { path: '/admin/support/:id', layout: 'platform', title: 'Ticket', permission: 'platform_support:view', parent: '/admin/support', element: L(() => import('@/features/platform/support-page')) },
  { path: '/admin/analytics', layout: 'platform', title: 'Analytics', permission: 'platform_analytics:view', element: L(() => import('@/features/platform/analytics-page')) },
  { path: '/admin/audit', layout: 'platform', title: 'Audit logs', permission: 'platform_audit:view', element: L(() => import('@/features/platform/audit-page')) },
  { path: '/admin/settings', layout: 'platform', title: 'Platform settings', permission: 'platform_settings:view', element: L(() => import('@/features/platform/settings-page')) },
  { path: '/admin/settings/users', layout: 'platform', title: 'Platform users', permission: 'platform_settings:manage_users', parent: '/admin/settings', element: L(() => import('@/features/platform/platform-users-page')) },
  { path: '/admin/settings/health', layout: 'platform', title: 'Platform health', permission: 'platform_settings:view_health', parent: '/admin/settings', element: L(() => import('@/features/platform/health-page')) },
  { path: '/admin/profile', layout: 'platform', title: 'Account settings', element: L(() => import('@/features/account/profile-page')) },

  // ---------------- society console
  { path: '/app', layout: 'society', title: 'Overview', permission: 'dashboard:view', element: L(() => import('@/features/society/dashboard-page')) },
  { path: '/app/onboarding', layout: 'society', title: 'Setup wizard', permission: ['society:update', 'society:manage_settings'], element: L(() => import('@/features/society/onboarding-page')) },
  { path: '/app/profile', layout: 'society', title: 'Account settings', subscriptionRequirement: 'none', element: L(() => import('@/features/account/profile-page')) },
  { path: '/app/support', layout: 'society', title: 'Support', module: 'support', permission: ['support:view', 'support:view_own', 'support:create'], subscriptionRequirement: 'none', element: L(() => import('@/features/society/support-page')) },
  { path: '/app/my', layout: 'society', title: 'My Home', permission: 'dashboard:view', subscriptionRequirement: 'none', element: L(() => import('@/features/society/member-home-page')) },
  { path: '/app/my/support', layout: 'society', title: 'Support', module: 'support', permission: ['support:create', 'support:view_own'], subscriptionRequirement: 'none', element: L(() => import('@/features/society/support-page')) },
  { path: '/app/settings', layout: 'society', title: 'Society settings', module: 'society', permission: ['society:view', 'society:manage_settings'], element: L(() => import('@/features/society/settings/general-page')) },
  { path: '/app/settings/modules', layout: 'society', title: 'Modules', module: 'society', permission: 'society:manage_modules', parent: '/app/settings', element: L(() => import('@/features/society/settings/modules-page')) },
  { path: '/app/settings/roles', layout: 'society', title: 'Roles & permissions', module: 'society', permission: 'society:manage_roles', parent: '/app/settings', element: L(() => import('@/features/society/settings/roles-page')) },
  { path: '/app/settings/roles/:id', layout: 'society', title: 'Role', module: 'society', permission: 'society:manage_roles', parent: '/app/settings/roles', element: L(() => import('@/features/society/settings/roles-page')) },
  { path: '/app/settings/users', layout: 'society', title: 'Users', module: 'society', permission: 'society:manage_users', parent: '/app/settings', element: L(() => import('@/features/society/settings/users-page')) },
  { path: '/app/settings/users/:userId', layout: 'society', title: 'User', module: 'society', permission: 'society:manage_users', parent: '/app/settings/users', element: L(() => import('@/features/society/settings/users-page')) },
  { path: '/app/settings/categories', layout: 'society', title: 'Categories', module: 'society', permission: 'society:manage_categories', parent: '/app/settings', element: L(() => import('@/features/society/settings/categories-page')) },
  { path: '/app/settings/notifications', layout: 'society', title: 'Notifications', module: 'society', permission: 'society:manage_notifications', parent: '/app/settings', element: L(() => import('@/features/society/settings/notifications-page')) },
  { path: '/app/settings/subscription', layout: 'society', title: 'Subscription', module: 'society', permission: ['society:view_subscription', 'society:manage_subscription'], subscriptionRequirement: 'none', parent: '/app/settings', element: L(() => import('@/features/society/settings/subscription-page')) },
  { path: '/app/settings/audit', layout: 'society', title: 'Audit log', module: 'society', permission: 'society:view_audit', parent: '/app/settings', element: L(() => import('@/features/society/settings/audit-page')) },
  { path: '/app/settings/import', layout: 'society', title: 'Data import', module: 'society', permission: 'society:import', parent: '/app/settings', element: L(() => import('@/features/society/settings/import-page')) },
  { path: '/app/residents', layout: 'society', title: 'Residents', module: 'residents', permission: 'residents:view', element: L(() => import('@/features/residents/residents-page')) },
  { path: '/app/residents/moves', layout: 'society', title: 'Move in / out', module: 'residents', permission: ['residents:move', 'residents:approve_move', 'residents:view'], parent: '/app/residents', element: L(() => import('@/features/residents/moves-page')) },
  { path: '/app/residents/:id', layout: 'society', title: 'Resident', module: 'residents', permission: 'residents:view', parent: '/app/residents', element: L(() => import('@/features/residents/residents-page')) },
  { path: '/app/directory', layout: 'society', title: 'Directory', module: 'residents', permission: ['residents:lookup', 'residents:view'], element: L(() => import('@/features/residents/directory-page')) },
  { path: '/app/my/profile', layout: 'society', title: 'My profile', module: 'residents', permission: 'residents:view_own', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-profile-page')) },
  { path: '/app/my/family', layout: 'society', title: 'My family', module: 'residents', permission: 'residents:view_own', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-family-page')) },
  { path: '/app/my/unit', layout: 'society', title: 'My unit', module: 'residents', permission: 'residents:view_own', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-unit-page')) },
  { path: '/app/buildings', layout: 'society', title: 'Buildings', module: 'units', permission: 'units:manage_structure', element: L(() => import('@/features/units/buildings-page')) },
  { path: '/app/units', layout: 'society', title: 'Units', module: 'units', permission: 'units:view', element: L(() => import('@/features/units/units-page')) },
  { path: '/app/units/:id', layout: 'society', title: 'Unit', module: 'units', permission: 'units:view', parent: '/app/units', element: L(() => import('@/features/units/unit-detail-page')) },
  // ---------------- finance: billing & payments
  { path: '/app/billing', layout: 'society', title: 'Billing', module: 'billing', permission: 'billing:view', element: L(() => import('@/features/billing/billing-page')) },
  { path: '/app/billing/setup', layout: 'society', title: 'Billing setup', module: 'billing', permission: 'billing:configure', parent: '/app/billing', element: L(() => import('@/features/billing/billing-setup-page')) },
  { path: '/app/billing/runs', layout: 'society', title: 'Billing runs', module: 'billing', permission: ['billing:generate', 'billing:view'], parent: '/app/billing', element: L(() => import('@/features/billing/billing-runs-page')) },
  { path: '/app/billing/runs/:id', layout: 'society', title: 'Billing run', module: 'billing', permission: ['billing:generate', 'billing:view'], parent: '/app/billing/runs', element: L(() => import('@/features/billing/billing-runs-page')) },
  { path: '/app/billing/meters', layout: 'society', title: 'Meter readings', module: 'billing', permission: ['billing:meter_readings', 'billing:view'], parent: '/app/billing', element: L(() => import('@/features/billing/meters-page')) },
  { path: '/app/billing/invoices/:id', layout: 'society', title: 'Invoice', module: 'billing', permission: 'billing:view', parent: '/app/billing', element: L(() => import('@/features/billing/invoice-page')) },
  { path: '/app/payments', layout: 'society', title: 'Payments', module: 'payments', permission: 'payments:view', element: L(() => import('@/features/payments/payments-page')) },
  { path: '/app/payments/:id', layout: 'society', title: 'Payment', module: 'payments', permission: 'payments:view', parent: '/app/payments', element: L(() => import('@/features/payments/payments-page')) },
  { path: '/app/payments/:id/receipt', layout: 'society', title: 'Receipt', module: 'payments', permission: 'payments:view', parent: '/app/payments', element: L(() => import('@/features/payments/receipt-page')) },
  { path: '/app/settings/payments', layout: 'society', title: 'Payment gateway', module: 'payments', permission: 'payments:configure', parent: '/app/settings', element: L(() => import('@/features/payments/gateway-settings-page')) },
  { path: '/app/my/bills', layout: 'society', title: 'My bills', module: 'billing', permission: 'billing:view_own', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-bills-page')) },
  { path: '/app/my/bills/:id', layout: 'society', title: 'Invoice', module: 'billing', permission: 'billing:view_own', subscriptionRequirement: 'none', parent: '/app/my/bills', element: L(() => import('@/features/member/my-invoice-page')) },
  { path: '/app/my/payments', layout: 'society', title: 'My payments', module: 'payments', permission: 'payments:view_own', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-payments-page')) },
  { path: '/app/my/payments/:id', layout: 'society', title: 'Receipt', module: 'payments', permission: 'payments:view_own', subscriptionRequirement: 'none', parent: '/app/my/payments', element: L(() => import('@/features/member/my-receipt-page')) },
  // ---------------- finance: expenses, vendors, accounting, approvals
  { path: '/app/expenses', layout: 'society', title: 'Expenses', module: 'expenses', permission: 'expenses:view', element: L(() => import('@/features/expenses/expenses-page')) },
  { path: '/app/expenses/purchase-orders', layout: 'society', title: 'Purchase orders', module: 'expenses', permission: 'expenses:view', parent: '/app/expenses', element: L(() => import('@/features/expenses/purchase-orders-page')) },
  { path: '/app/expenses/purchase-orders/:id', layout: 'society', title: 'Purchase order', module: 'expenses', permission: 'expenses:view', parent: '/app/expenses/purchase-orders', element: L(() => import('@/features/expenses/purchase-orders-page')) },
  { path: '/app/expenses/:id', layout: 'society', title: 'Expense', module: 'expenses', permission: 'expenses:view', parent: '/app/expenses', element: L(() => import('@/features/expenses/expense-detail-page')) },
  { path: '/app/vendors', layout: 'society', title: 'Vendors', module: 'vendors', permission: 'vendors:view', element: L(() => import('@/features/expenses/vendors-page')) },
  { path: '/app/vendors/:id', layout: 'society', title: 'Vendor', module: 'vendors', permission: 'vendors:view', parent: '/app/vendors', element: L(() => import('@/features/expenses/vendors-page')) },
  { path: '/app/accounting', layout: 'society', title: 'Accounting', module: 'accounting', permission: 'accounting:view', element: L(() => import('@/features/accounting/accounting-page')) },
  { path: '/app/accounting/journals', layout: 'society', title: 'Journals', module: 'accounting', permission: 'accounting:view', parent: '/app/accounting', element: L(() => import('@/features/accounting/journals-page')) },
  { path: '/app/accounting/journals/:id', layout: 'society', title: 'Journal entry', module: 'accounting', permission: 'accounting:view', parent: '/app/accounting/journals', element: L(() => import('@/features/accounting/journals-page')) },
  { path: '/app/accounting/accounts', layout: 'society', title: 'Chart of accounts', module: 'accounting', permission: 'accounting:view', parent: '/app/accounting', element: L(() => import('@/features/accounting/chart-of-accounts-page')) },
  { path: '/app/accounting/bank', layout: 'society', title: 'Bank & reconciliation', module: 'accounting', permission: ['accounting:reconcile', 'accounting:configure', 'accounting:view'], parent: '/app/accounting', element: L(() => import('@/features/accounting/bank-page')) },
  { path: '/app/approvals', layout: 'society', title: 'Approvals', module: 'society', element: L(() => import('@/features/approvals/approvals-page')) },
  { path: '/app/settings/workflows', layout: 'society', title: 'Approval workflows', module: 'society', permission: ['society:manage_workflows', 'society:manage_settings'], parent: '/app/settings', element: L(() => import('@/features/society/settings/workflows-page')) },
  // ---------------- operations: helpdesk
  { path: '/app/complaints', layout: 'society', title: 'Complaints', module: 'complaints', permission: 'complaints:view', element: L(() => import('@/features/complaints/complaints-page')) },
  { path: '/app/complaints/settings', layout: 'society', title: 'SLA & escalation', module: 'complaints', permission: 'complaints:configure', parent: '/app/complaints', element: L(() => import('@/features/complaints/complaints-settings-page')) },
  { path: '/app/complaints/:id', layout: 'society', title: 'Complaint', module: 'complaints', permission: 'complaints:view', parent: '/app/complaints', element: L(() => import('@/features/complaints/complaint-detail-page')) },
  // ---------------- amenities
  { path: '/app/amenities', layout: 'society', title: 'Amenities', module: 'amenities', permission: ['amenities:view_bookings', 'amenities:update'], element: L(() => import('@/features/amenities/amenities-page')) },
  { path: '/app/amenities/bookings/:id', layout: 'society', title: 'Booking', module: 'amenities', permission: ['amenities:view_bookings', 'amenities:approve'], parent: '/app/amenities', element: L(() => import('@/features/amenities/booking-detail-page')) },
  { path: '/app/my/amenities', layout: 'society', title: 'My amenities', module: 'amenities', permission: ['amenities:book', 'amenities:view_own'], subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-amenities-page')) },
  // ---------------- communication: notices, community feed, events, polls, surveys
  { path: '/app/notices', layout: 'society', title: 'Notices', module: 'notices', permission: ['notices:create', 'notices:publish', 'notices:update'], element: L(() => import('@/features/community/notices-page')) },
  { path: '/app/my/notices', layout: 'society', title: 'Notices', module: 'notices', permission: 'notices:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-notices-page')) },
  { path: '/app/my/notices/:id', layout: 'society', title: 'Notice', module: 'notices', permission: 'notices:view', subscriptionRequirement: 'none', parent: '/app/my/notices', element: L(() => import('@/features/member/my-notice-page')) },
  { path: '/app/community', layout: 'society', title: 'Community', module: 'communication', permission: ['communication:moderate', 'communication:announce'], element: L(() => import('@/features/community/community-page')) },
  { path: '/app/my/community', layout: 'society', title: 'Community', module: 'communication', permission: 'communication:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-community-page')) },
  { path: '/app/events', layout: 'society', title: 'Events', module: 'events', permission: ['events:create', 'events:update'], element: L(() => import('@/features/community/events-page')) },
  { path: '/app/my/events', layout: 'society', title: 'Events', module: 'events', permission: 'events:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-events-page')) },
  { path: '/app/my/events/:id', layout: 'society', title: 'Event', module: 'events', permission: 'events:view', subscriptionRequirement: 'none', parent: '/app/my/events', element: L(() => import('@/features/member/my-event-page')) },
  { path: '/app/polls', layout: 'society', title: 'Polls', module: 'polls', permission: ['polls:create', 'polls:results'], element: L(() => import('@/features/community/polls-page')) },
  { path: '/app/my/polls', layout: 'society', title: 'Polls', module: 'polls', permission: 'polls:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-polls-page')) },
  { path: '/app/surveys', layout: 'society', title: 'Surveys', module: 'surveys', permission: ['surveys:create', 'surveys:results'], element: L(() => import('@/features/community/surveys-page')) },
  { path: '/app/my/surveys', layout: 'society', title: 'Surveys', module: 'surveys', permission: 'surveys:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-surveys-page')) },
  { path: '/app/my/surveys/:id', layout: 'society', title: 'Survey', module: 'surveys', permission: 'surveys:view', subscriptionRequirement: 'none', parent: '/app/my/surveys', element: L(() => import('@/features/member/my-survey-page')) },
  // ---------------- documents
  { path: '/app/documents', layout: 'society', title: 'Documents', module: 'documents', permission: 'documents:view', element: L(() => import('@/features/documents/documents-page')) },
  { path: '/app/my/documents', layout: 'society', title: 'My documents', module: 'documents', permission: 'documents:view_own', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-documents-page')) },
  // ---------------- governance: meetings, voting, committee
  { path: '/app/meetings', layout: 'society', title: 'Meetings', module: 'meetings', permission: ['meetings:create', 'meetings:update', 'meetings:minutes'], element: L(() => import('@/features/governance/meetings-page')) },
  { path: '/app/my/meetings', layout: 'society', title: 'Meetings', module: 'meetings', permission: 'meetings:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-meetings-page')) },
  { path: '/app/my/meetings/:id', layout: 'society', title: 'Meeting', module: 'meetings', permission: 'meetings:view', subscriptionRequirement: 'none', parent: '/app/my/meetings', element: L(() => import('@/features/member/my-meeting-page')) },
  { path: '/app/voting', layout: 'society', title: 'Voting', module: 'voting', permission: ['voting:create', 'voting:results', 'voting:close'], element: L(() => import('@/features/governance/voting-page')) },
  { path: '/app/my/voting', layout: 'society', title: 'Voting', module: 'voting', permission: 'voting:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-voting-page')) },
  { path: '/app/committee', layout: 'society', title: 'Committee', module: 'governance', permission: ['governance:view', 'governance:manage'], element: L(() => import('@/features/governance/committee-page')) },
  { path: '/app/my/complaints', layout: 'society', title: 'My complaints', module: 'complaints', permission: 'complaints:view_own', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-complaints-page')) },
  { path: '/app/my/complaints/:id', layout: 'society', title: 'Complaint', module: 'complaints', permission: 'complaints:view_own', subscriptionRequirement: 'none', parent: '/app/my/complaints', element: L(() => import('@/features/member/my-complaint-page')) },
  // ---------------- operations: visitors & deliveries
  { path: '/app/visitors', layout: 'society', title: 'Visitors', module: 'visitors', permission: 'visitors:view', element: L(() => import('@/features/visitors/visitors-page')) },
  { path: '/app/deliveries', layout: 'society', title: 'Deliveries', module: 'delivery', permission: 'delivery:view', element: L(() => import('@/features/visitors/deliveries-page')) },
  { path: '/app/my/visitors', layout: 'society', title: 'My visitors', module: 'visitors', permission: ['visitors:view_own', 'visitors:create_own'], subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-visitors-page')) },
  { path: '/app/my/deliveries', layout: 'society', title: 'My deliveries', module: 'delivery', permission: ['delivery:view_own', 'delivery:create_own'], subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-deliveries-page')) },

  // ---------------- operations: staff, domestic help, vehicles & parking
  { path: '/app/staff', layout: 'society', title: 'Staff', module: 'staff', permission: 'staff:view', element: L(() => import('@/features/staff/staff-page')) },
  { path: '/app/domestic-help', layout: 'society', title: 'Domestic help', module: 'domestic_help', permission: 'domestic_help:view', element: L(() => import('@/features/operations/domestic-help-page')) },
  { path: '/app/my/domestic-help', layout: 'society', title: 'My domestic help', module: 'domestic_help', permission: ['domestic_help:view_own', 'domestic_help:create_own'], subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-domestic-help-page')) },
  { path: '/app/vehicles', layout: 'society', title: 'Vehicles', module: 'vehicles', permission: 'vehicles:view', element: L(() => import('@/features/operations/vehicles-page')) },
  { path: '/app/my/vehicles', layout: 'society', title: 'My vehicles', module: 'vehicles', permission: ['vehicles:view_own', 'vehicles:create_own'], subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-vehicles-page')) },
  { path: '/app/parking', layout: 'society', title: 'Parking', module: 'parking', permission: 'parking:view', element: L(() => import('@/features/operations/parking-page')) },

  // ---------------- security & emergency
  { path: '/app/security', layout: 'society', title: 'Security', module: 'security', permission: 'security:view', element: L(() => import('@/features/security/security-page')) },
  { path: '/app/emergency', layout: 'society', title: 'Emergency', module: 'emergency', permission: ['emergency:manage', 'emergency:respond', 'emergency:broadcast'], subscriptionRequirement: 'none', element: L(() => import('@/features/emergency/emergency-page')) },
  { path: '/app/my/emergency', layout: 'society', title: 'Emergency', module: 'emergency', permission: 'emergency:view', subscriptionRequirement: 'none', element: L(() => import('@/features/member/my-emergency-page')) },

  // ---------------- contracts, assets & inventory
  { path: '/app/contracts', layout: 'society', title: 'Contracts & AMC', module: 'contracts', permission: 'contracts:view', element: L(() => import('@/features/contracts/contracts-page')) },
  { path: '/app/assets', layout: 'society', title: 'Assets', module: 'assets', permission: 'assets:view', element: L(() => import('@/features/assets/assets-page')) },
  { path: '/app/inventory', layout: 'society', title: 'Inventory', module: 'inventory', permission: 'inventory:view', element: L(() => import('@/features/inventory/inventory-page')) },

  // ---------------- reports
  { path: '/app/reports', layout: 'society', title: 'Reports', module: 'reports', permission: 'reports:view', element: L(() => import('@/features/reports/reports-page')) },
  { path: '/app/reports/:key', layout: 'society', title: 'Report', module: 'reports', permission: 'reports:view', parent: '/app/reports', element: L(() => import('@/features/reports/report-page')) },

  // ---------------- guard app (mobile-first, offline-capable)
  { path: '/guard', layout: 'guard', title: 'Gate', module: 'visitors', permission: ['visitors:checkin', 'visitors:checkout', 'visitors:view'], element: L(() => import('@/features/guard/gate-dashboard-page')) },
  { path: '/guard/scan', layout: 'guard', title: 'Scan pass', module: 'visitors', permission: 'visitors:checkin', parent: '/guard', element: L(() => import('@/features/guard/gate-scan-page')) },
  { path: '/guard/walk-in', layout: 'guard', title: 'Walk-in', module: 'visitors', permission: 'visitors:create', parent: '/guard', element: L(() => import('@/features/guard/gate-walkin-page')) },
  { path: '/guard/expected', layout: 'guard', title: 'Expected', module: 'visitors', permission: 'visitors:view', parent: '/guard', element: L(() => import('@/features/guard/gate-expected-page')) },
  { path: '/guard/timeline', layout: 'guard', title: 'Timeline', module: 'visitors', permission: 'visitors:view', parent: '/guard', element: L(() => import('@/features/guard/gate-timeline-page')) },
  { path: '/guard/deliveries', layout: 'guard', title: 'Deliveries', module: 'delivery', permission: 'delivery:create', parent: '/guard', element: L(() => import('@/features/guard/gate-deliveries-page')) },
  { path: '/guard/help', layout: 'guard', title: 'Help & vehicles', module: 'domestic_help', permission: 'domestic_help:view', parent: '/guard', element: L(() => import('@/features/guard/gate-help-page')) },
  { path: '/guard/incidents', layout: 'guard', title: 'Incidents', module: 'security', permission: 'security:create', parent: '/guard', element: L(() => import('@/features/guard/gate-incidents-page')) },
  { path: '/guard/emergency', layout: 'guard', title: 'Emergency', module: 'emergency', permission: 'emergency:view', subscriptionRequirement: 'none', parent: '/guard', element: L(() => import('@/features/guard/gate-emergency-page')) },
];

export function findRoute(pathname: string): AppRoute | undefined {
  return routes.find((r) => matchPath({ path: r.path, end: true }, pathname));
}

export function routesByLayout(layout: RouteLayout): AppRoute[] {
  return routes.filter((r) => r.layout === layout);
}

/** Breadcrumb trail derived from the parent chain declared in the route config. */
export function breadcrumbsFor(pathname: string): { label: string; to?: string }[] {
  const route = findRoute(pathname);
  if (!route) return [];
  const chain: AppRoute[] = [];
  let current: AppRoute | undefined = route;
  while (current) {
    chain.unshift(current);
    current = current.parent ? routes.find((r) => r.path === current!.parent) : undefined;
  }
  return chain.map((r, i) => ({ label: r.title, to: i < chain.length - 1 ? r.path : undefined }));
}

export function registerRoutes(extra: AppRoute[]): void {
  for (const r of extra) if (!routes.some((x) => x.path === r.path)) routes.push(r);
}
