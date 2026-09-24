import type { SignupInput } from '@society-erp/shared';
import { Errors } from '../../lib/errors';
import { configurationService } from '../../core/configuration/configuration.service';
import { societyService } from '../../core/tenancy/society.service';
import { authService } from '../auth/auth.service';
import { planService } from '../platform/plans.service';
import { Plan } from '../../models/plan.model';

class SignupService {
  async config() {
    const [enabled, defaultPlan, plans, brandName] = await Promise.all([
      configurationService.getPlatformSetting<boolean>('signup.enabled', true),
      planService.defaultPlan(),
      planService.publicPlans(),
      configurationService.getPlatformSetting<string>('brand.name', 'Society ERP'),
    ]);
    const trialDays = await configurationService.getPlatformSetting<number>('subscription.defaultTrialDays', 14);
    return { enabled, defaultPlanId: defaultPlan ? String(defaultPlan._id) : null, plans, trialDays, brandName };
  }

  /** Public self-service signup: society + admin + trial subscription created atomically, then auto-login. */
  async signup(input: SignupInput, meta: { ip?: string; userAgent?: string }) {
    const enabled = await configurationService.getPlatformSetting<boolean>('signup.enabled', true);
    if (!enabled) throw Errors.forbidden('Self-service signup is currently disabled. Please contact us for onboarding.');
    const plan = await Plan.findById(input.planId).lean();
    if (!plan || plan.status !== 'ACTIVE' || !plan.publicVisibility) throw Errors.validation({ planId: ['Please choose an available plan'] });
    const result = await societyService.createSociety({
      society: {
        name: input.society.name,
        slug: input.society.slug,
        type: input.society.type,
        city: input.society.city,
        state: input.society.state,
        pincode: input.society.pincode,
        addressLine1: input.society.addressLine1,
        totalUnits: input.society.totalUnits,
        contactEmail: input.admin.email,
        contactPhone: input.admin.phone,
      },
      admin: { name: input.admin.name, email: input.admin.email, phone: input.admin.phone, password: input.admin.password },
      planId: input.planId,
      billingCycle: input.billingCycle,
      startTrial: true,
      source: 'SIGNUP',
      allowExistingAdmin: false,
    });
    const login = await authService.login({ email: input.admin.email, password: input.admin.password, societyId: String(result.society._id) }, meta);
    return { societyId: String(result.society._id), slug: result.society.slug, ...login };
  }
}

export const signupService = new SignupService();
