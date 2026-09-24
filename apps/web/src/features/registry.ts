/**
 * Feature registrations. Business modules plug into extension slots (dashboard widgets, unit detail
 * sections, member "my unit" cards) by importing their register file here. Routes stay in app/routes.tsx.
 */
import '@/features/billing/register';
import '@/features/finance/register';
import '@/features/complaints/register';
import '@/features/visitors/register';
import '@/features/amenities/register';
import '@/features/community/register';
import '@/features/documents/register';
import '@/features/governance/register';
import '@/features/operations/register';
import '@/features/security/register';
import '@/features/assets/register';
