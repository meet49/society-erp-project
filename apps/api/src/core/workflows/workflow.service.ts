import mongoose, { type ClientSession } from 'mongoose';
import { ErrorCodes } from '@society-erp/shared';
import { WorkflowDefinition, WorkflowInstance, type WorkflowInstanceDoc } from '../../models/workflow.model';
import { Role } from '../../models/role.model';
import { UserRole } from '../../models/user-role.model';
import { Errors } from '../../lib/errors';
import { auditService } from '../audit/audit.service';
import { domainEvents } from '../events/event-bus';
import { accessControlService } from '../access-control/access-control.service';
import { registerSocietyInitializer } from '../tenancy/society.service';

export interface WorkflowCondition {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'in';
  value: unknown;
}

export interface WorkflowStepInput {
  order: number;
  name: string;
  approverType: 'ROLE' | 'USER' | 'PERMISSION';
  approverRef: string;
  condition?: WorkflowCondition | null;
  requiredApprovals?: number;
}

export interface WorkflowDefaults {
  key: string;
  name: string;
  description: string;
  entityType: string;
  steps: WorkflowStepInput[];
  autoApproveCondition?: WorkflowCondition | null;
  active?: boolean;
}

/** Default approval workflows every society starts with. Fully editable under Settings → Workflows. */
export const DEFAULT_WORKFLOWS: WorkflowDefaults[] = [
  {
    key: 'expense_approval',
    name: 'Expense approval',
    description: 'Committee approves expenses; large amounts also need the society admin.',
    entityType: 'Expense',
    autoApproveCondition: { field: 'amount', operator: 'lt', value: 2000 },
    steps: [
      { order: 1, name: 'Committee review', approverType: 'ROLE', approverRef: 'COMMITTEE', requiredApprovals: 1 },
      { order: 2, name: 'Admin approval for large expenses', approverType: 'ROLE', approverRef: 'SOCIETY_ADMIN', condition: { field: 'amount', operator: 'gte', value: 50000 }, requiredApprovals: 1 },
    ],
  },
  {
    key: 'purchase_approval',
    name: 'Purchase order approval',
    description: 'Purchase orders are approved by the committee before they are sent to the vendor.',
    entityType: 'PurchaseOrder',
    autoApproveCondition: { field: 'amount', operator: 'lt', value: 5000 },
    steps: [{ order: 1, name: 'Committee approval', approverType: 'ROLE', approverRef: 'COMMITTEE', requiredApprovals: 1 }],
  },
  {
    key: 'vendor_approval',
    name: 'Vendor onboarding',
    description: 'New vendors are approved by the society admin before they can be used.',
    entityType: 'Vendor',
    active: false,
    steps: [{ order: 1, name: 'Admin approval', approverType: 'ROLE', approverRef: 'SOCIETY_ADMIN', requiredApprovals: 1 }],
  },
  {
    key: 'amenity_approval',
    name: 'Amenity booking approval',
    description: 'Bookings of amenities marked “requires approval” are confirmed by the committee.',
    entityType: 'AmenityBooking',
    steps: [{ order: 1, name: 'Committee approval', approverType: 'PERMISSION', approverRef: 'amenities:approve', requiredApprovals: 1 }],
  },
  {
    key: 'document_approval',
    name: 'Document publishing',
    description: 'Documents uploaded by staff are reviewed before members can see them.',
    entityType: 'Document',
    active: false,
    steps: [{ order: 1, name: 'Admin review', approverType: 'ROLE', approverRef: 'SOCIETY_ADMIN', requiredApprovals: 1 }],
  },
];

export function evaluateCondition(cond: WorkflowCondition | null | undefined, context: Record<string, unknown>): boolean {
  if (!cond) return true;
  const actual = context[cond.field];
  const expected = cond.value as any;
  switch (cond.operator) {
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'eq': return String(actual) === String(expected);
    case 'neq': return String(actual) !== String(expected);
    case 'in': return Array.isArray(expected) && expected.map(String).includes(String(actual));
    default: return true;
  }
}

export interface StartResult {
  instance: WorkflowInstanceDoc | null;
  /** true when no workflow applies or the auto-approve condition matched */
  autoApproved: boolean;
}

/**
 * Configurable approval engine. Business modules call `start()` when an entity is submitted and
 * react to the `workflow.completed` domain event (or the returned instance) to move the entity on.
 */
class WorkflowService {
  // ------------------------------------------------------------------ definitions
  async ensureDefaults(societyId: string, session?: ClientSession): Promise<void> {
    for (const d of DEFAULT_WORKFLOWS) {
      await WorkflowDefinition.updateOne({ societyId, key: d.key }, { $setOnInsert: { ...d, active: d.active ?? true, societyId } }, { upsert: true, session });
    }
  }

  async list(societyId: string) {
    await this.ensureDefaults(societyId);
    return WorkflowDefinition.find({ societyId }).sort({ key: 1 }).lean();
  }

  async get(societyId: string, key: string) {
    const def = await WorkflowDefinition.findOne({ societyId, key }).lean();
    if (!def) throw Errors.notFound('Workflow');
    return def;
  }

  async update(societyId: string, key: string, patch: { name?: string; description?: string; active?: boolean; steps?: WorkflowStepInput[]; autoApproveCondition?: WorkflowCondition | null }, byUserId: string, req?: any) {
    const def = await WorkflowDefinition.findOne({ societyId, key });
    if (!def) throw Errors.notFound('Workflow');
    if (patch.steps) {
      const roles = await Role.find({ societyId }).select('key').lean();
      const roleKeys = new Set(roles.map((r) => r.key));
      for (const s of patch.steps) {
        if (s.approverType === 'ROLE' && !roleKeys.has(s.approverRef.toUpperCase())) throw Errors.validation({ steps: [`Unknown role ${s.approverRef}`] });
        if (s.approverType === 'USER' && !mongoose.isValidObjectId(s.approverRef)) throw Errors.validation({ steps: ['Approver user id is invalid'] });
      }
      def.steps = patch.steps.map((s, i) => ({ ...s, order: i + 1, approverRef: s.approverType === 'ROLE' ? s.approverRef.toUpperCase() : s.approverRef, requiredApprovals: Math.max(1, s.requiredApprovals ?? 1), condition: s.condition ?? null })) as any;
    }
    if (patch.name !== undefined) def.name = patch.name;
    if (patch.description !== undefined) def.description = patch.description;
    if (patch.active !== undefined) def.active = patch.active;
    if (patch.autoApproveCondition !== undefined) def.set('autoApproveCondition', patch.autoApproveCondition);
    def.updatedBy = byUserId as any;
    await def.save();
    auditService.record({ action: 'workflow.updated', resource: 'WorkflowDefinition', resourceId: def._id, societyId, newValue: { key, active: def.active, steps: def.steps.length }, req });
    return def.toJSON();
  }

  // ------------------------------------------------------------------ instances
  /** Starts (or auto-approves) the workflow for an entity. Idempotent per entity: a pending instance is returned as-is. */
  async start(input: { societyId: string; key: string; entityType: string; entityId: any; context: Record<string, unknown>; startedBy: string; session?: ClientSession }): Promise<StartResult> {
    const existing = await WorkflowInstance.findOne({ societyId: input.societyId, entityType: input.entityType, entityId: input.entityId, status: 'PENDING' }).session(input.session ?? null);
    if (existing) return { instance: existing, autoApproved: false };
    const def = await WorkflowDefinition.findOne({ societyId: input.societyId, key: input.key }).session(input.session ?? null);
    if (!def || !def.active || !def.steps.length) return { instance: null, autoApproved: true };
    if (def.autoApproveCondition && evaluateCondition(def.autoApproveCondition as any, input.context)) return { instance: null, autoApproved: true };
    const steps = def.steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ order: s.order, name: s.name, approverType: s.approverType, approverRef: s.approverRef, requiredApprovals: s.requiredApprovals ?? 1, status: evaluateCondition(s.condition as any, input.context) ? 'PENDING' : 'SKIPPED', decisions: [] }));
    if (!steps.some((s) => s.status === 'PENDING')) return { instance: null, autoApproved: true };
    const [instance] = await WorkflowInstance.create([{ societyId: input.societyId, workflowId: def._id, workflowKey: def.key, entityType: input.entityType, entityId: input.entityId, status: 'PENDING', currentStep: steps.findIndex((s) => s.status === 'PENDING'), steps, context: input.context, startedBy: input.startedBy }], { session: input.session });
    await this.notifyCurrentStep(instance);
    return { instance, autoApproved: false };
  }

  private async approversFor(societyId: string, step: { approverType: string; approverRef: string }): Promise<string[]> {
    if (step.approverType === 'USER') return [step.approverRef];
    if (step.approverType === 'ROLE') {
      const role = await Role.findOne({ societyId, key: step.approverRef }).select('_id').lean();
      if (!role) return [];
      const links = await UserRole.find({ societyId, roleId: role._id }).select('userId').lean();
      return links.map((l) => String(l.userId));
    }
    return []; // PERMISSION-based steps are resolved through notification recipients by permission
  }

  private async notifyCurrentStep(instance: WorkflowInstanceDoc): Promise<void> {
    const step = instance.steps[instance.currentStep];
    if (!step) return;
    const userIds = await this.approversFor(String(instance.societyId), step);
    domainEvents.emit('workflow.step_pending', { instanceId: String(instance._id), workflowKey: instance.workflowKey, entityType: instance.entityType, entityId: String(instance.entityId), stepName: step.name, approverType: step.approverType, approverRef: step.approverRef, userIds, context: instance.context }, { societyId: String(instance.societyId), actorId: instance.startedBy ? String(instance.startedBy) : null });
  }

  /** Can this user decide on the current step? */
  async canDecide(instance: WorkflowInstanceDoc, user: { userId: string; roleKeys: string[]; permissions: Set<string> }): Promise<boolean> {
    const step = instance.steps[instance.currentStep];
    if (!step || instance.status !== 'PENDING') return false;
    if (step.approverType === 'USER') return step.approverRef === user.userId;
    if (step.approverType === 'ROLE') return user.roleKeys.includes(step.approverRef);
    if (step.approverType === 'PERMISSION') return accessControlService.hasPermission({ permissions: user.permissions }, step.approverRef);
    return false;
  }

  async decide(societyId: string, instanceId: string, user: { userId: string; roleKeys: string[]; permissions: Set<string> }, decision: 'APPROVED' | 'REJECTED', note?: string, req?: any): Promise<WorkflowInstanceDoc> {
    const instance = await WorkflowInstance.findOne({ _id: instanceId, societyId });
    if (!instance) throw Errors.notFound('Approval request');
    if (instance.status !== 'PENDING') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `This request is already ${instance.status.toLowerCase()}`);
    if (!(await this.canDecide(instance, user))) throw Errors.forbidden('You are not an approver for the current step');
    const step = instance.steps[instance.currentStep];
    if (step.decisions.some((d) => String(d.userId) === user.userId)) throw Errors.conflict('You have already decided on this step');
    step.decisions.push({ userId: user.userId, decision, note, at: new Date() } as any);
    if (decision === 'REJECTED') {
      step.status = 'REJECTED';
      instance.status = 'REJECTED';
      instance.completedAt = new Date();
    } else if (step.decisions.filter((d) => d.decision === 'APPROVED').length >= (step.requiredApprovals ?? 1)) {
      step.status = 'APPROVED';
      const next = instance.steps.findIndex((s, i) => i > instance.currentStep && s.status === 'PENDING');
      if (next === -1) {
        instance.status = 'APPROVED';
        instance.completedAt = new Date();
      } else instance.currentStep = next;
    }
    instance.markModified('steps');
    await instance.save();
    auditService.record({ action: `workflow.${decision.toLowerCase()}`, resource: instance.entityType, resourceId: instance.entityId, societyId, newValue: { workflow: instance.workflowKey, step: step.name, note }, req });
    if (instance.status === 'PENDING') await this.notifyCurrentStep(instance);
    else domainEvents.emit('workflow.completed', { instanceId: String(instance._id), workflowKey: instance.workflowKey, entityType: instance.entityType, entityId: String(instance.entityId), status: instance.status, decidedBy: user.userId, note, context: instance.context, startedBy: instance.startedBy ? String(instance.startedBy) : null }, { societyId, actorId: user.userId });
    return instance;
  }

  async cancel(societyId: string, entityType: string, entityId: any, byUserId?: string): Promise<void> {
    await WorkflowInstance.updateMany({ societyId, entityType, entityId, status: 'PENDING' }, { $set: { status: 'CANCELLED', completedAt: new Date() } });
    if (byUserId) auditService.record({ action: 'workflow.cancelled', resource: entityType, resourceId: entityId, societyId, actor: { id: byUserId } });
  }

  async instanceFor(societyId: string, entityType: string, entityId: any) {
    return WorkflowInstance.findOne({ societyId, entityType, entityId }).sort({ createdAt: -1 }).populate('steps.decisions.userId', 'name').lean();
  }

  /** Approval requests waiting on this user (role / user / permission based). */
  async pendingFor(societyId: string, user: { userId: string; roleKeys: string[]; permissions: Set<string> }, opts: { entityType?: string; limit?: number } = {}) {
    const filter: Record<string, unknown> = { societyId, status: 'PENDING' };
    if (opts.entityType) filter.entityType = opts.entityType;
    const instances = await WorkflowInstance.find(filter).sort({ createdAt: 1 }).limit(opts.limit ?? 100).populate('startedBy', 'name').lean();
    const mine: any[] = [];
    for (const inst of instances) {
      const step = inst.steps[inst.currentStep];
      if (!step) continue;
      const ok = step.approverType === 'USER' ? step.approverRef === user.userId : step.approverType === 'ROLE' ? user.roleKeys.includes(step.approverRef) : accessControlService.hasPermission({ permissions: user.permissions }, step.approverRef);
      if (ok && !step.decisions.some((d: any) => String(d.userId) === user.userId)) mine.push({ ...inst, id: String(inst._id), currentStepName: step.name });
    }
    return mine;
  }

  async listInstances(societyId: string, query: { entityType?: string; status?: string; limit?: number }) {
    const filter: Record<string, unknown> = { societyId };
    if (query.entityType) filter.entityType = query.entityType;
    if (query.status) filter.status = query.status;
    return WorkflowInstance.find(filter).sort({ createdAt: -1 }).limit(query.limit ?? 50).populate('startedBy', 'name').lean();
  }
}

export const workflowService = new WorkflowService();

registerSocietyInitializer('workflows', async ({ societyId, session }) => {
  await workflowService.ensureDefaults(societyId, session);
});
