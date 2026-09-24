import { Errors } from '../../lib/errors';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ------------------------------------------------------------------ safe formula evaluator
const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  round: (n) => Math.round(n),
  ceil: (n) => Math.ceil(n),
  floor: (n) => Math.floor(n),
  abs: (n) => Math.abs(n),
};

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' } | { t: 'comma' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      tokens.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j += 1;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/%'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    if (c === '(') tokens.push({ t: 'lp' });
    else if (c === ')') tokens.push({ t: 'rp' });
    else if (c === ',') tokens.push({ t: 'comma' });
    else throw new Error(`Unexpected character "${c}"`);
    i += 1;
  }
  return tokens;
}

/** Evaluates arithmetic formulas with named variables and a whitelist of functions. No eval, no globals. */
export function evaluateFormula(formula: string, vars: Record<string, number>): number {
  const tokens = tokenize(formula);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expr = (): number => {
    let left = term();
    while (peek()?.t === 'op' && (peek() as any).v === '+' || (peek()?.t === 'op' && (peek() as any).v === '-')) {
      const op = (next() as any).v;
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const term = (): number => {
    let left = factor();
    while (peek()?.t === 'op' && ['*', '/', '%'].includes((peek() as any).v)) {
      const op = (next() as any).v;
      const right = factor();
      if (op === '*') left *= right;
      else if (op === '/') left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
    }
    return left;
  };
  const factor = (): number => {
    const tok = next();
    if (!tok) throw new Error('Unexpected end of formula');
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'op' && tok.v === '-') return -factor();
    if (tok.t === 'op' && tok.v === '+') return factor();
    if (tok.t === 'lp') {
      const v = expr();
      if (next()?.t !== 'rp') throw new Error('Missing )');
      return v;
    }
    if (tok.t === 'id') {
      if (peek()?.t === 'lp') {
        const fn = FUNCTIONS[tok.v];
        if (!fn) throw new Error(`Unknown function ${tok.v}`);
        next();
        const args: number[] = [];
        if (peek()?.t !== 'rp') {
          args.push(expr());
          while (peek()?.t === 'comma') {
            next();
            args.push(expr());
          }
        }
        if (next()?.t !== 'rp') throw new Error('Missing )');
        return fn(...args);
      }
      if (!(tok.v in vars)) throw new Error(`Unknown variable ${tok.v}`);
      return vars[tok.v];
    }
    throw new Error('Invalid formula');
  };
  const value = expr();
  if (pos !== tokens.length) throw new Error('Unexpected token');
  if (!Number.isFinite(value)) throw new Error('Formula did not produce a number');
  return value;
}

export const FORMULA_VARIABLES = ['area', 'floor', 'bedrooms', 'consumption', 'amount', 'rate', 'units'] as const;

export function validateFormula(formula: string): void {
  try {
    evaluateFormula(formula, { area: 1000, floor: 1, bedrooms: 2, consumption: 10, amount: 100, rate: 1, units: 1 });
  } catch (err) {
    throw Errors.validation({ formula: [`Invalid formula: ${(err as Error).message}. Variables: ${FORMULA_VARIABLES.join(', ')}; functions: ${Object.keys(FUNCTIONS).join(', ')}`] });
  }
}

// ------------------------------------------------------------------ line items
export interface CalcUnit {
  _id: any;
  code: string;
  type: string;
  buildingId?: any;
  areaSqft?: number;
  floor?: number;
  bedrooms?: number;
}

export interface CalcHead {
  _id: any;
  name: string;
  code: string;
  type: string;
  amount: number;
  rate: number;
  formula?: string | null;
  meterType?: string | null;
  taxRate: number;
  ledgerAccountCode?: string | null;
  fundKey?: string | null;
  applicableUnitTypes: string[];
  applicableBuildingIds: any[];
}

export interface ReadingInput {
  id: string;
  consumption: number;
}

export interface LineItemDraft {
  chargeHeadId: any;
  code: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  meterReadingId: string | null;
  ledgerAccountCode?: string | null;
  fundKey?: string | null;
}

export function isHeadApplicable(head: CalcHead, unit: CalcUnit): boolean {
  if (head.applicableUnitTypes?.length && !head.applicableUnitTypes.includes(unit.type)) return false;
  if (head.applicableBuildingIds?.length && !head.applicableBuildingIds.some((b) => String(b) === String(unit.buildingId ?? ''))) return false;
  return true;
}

/** Computes the current-period line items for one unit from the configured charge heads. */
export function computeLineItems(unit: CalcUnit, heads: CalcHead[], readings: Map<string, ReadingInput>): { items: LineItemDraft[]; readingIds: string[] } {
  const items: LineItemDraft[] = [];
  const readingIds: string[] = [];
  const percentageHeads: CalcHead[] = [];
  const area = unit.areaSqft ?? 0;
  for (const head of heads) {
    if (!isHeadApplicable(head, unit)) continue;
    let amount = 0;
    let quantity = 1;
    let rate = head.rate ?? 0;
    let meterReadingId: string | null = null;
    switch (head.type) {
      case 'FIXED':
      case 'PER_UNIT':
        amount = head.amount;
        rate = head.amount;
        break;
      case 'AREA_BASED':
        if (!area) continue;
        quantity = area;
        amount = round2(rate * area);
        break;
      case 'METER_BASED': {
        const reading = head.meterType ? readings.get(head.meterType.toUpperCase()) : undefined;
        if (!reading && !head.amount) continue;
        quantity = reading?.consumption ?? 0;
        amount = round2(head.amount + rate * quantity);
        meterReadingId = reading?.id ?? null;
        if (reading) readingIds.push(reading.id);
        break;
      }
      case 'FORMULA': {
        if (!head.formula) continue;
        const consumption = head.meterType ? readings.get(head.meterType.toUpperCase())?.consumption ?? 0 : 0;
        amount = round2(evaluateFormula(head.formula, { area, floor: unit.floor ?? 0, bedrooms: unit.bedrooms ?? 0, consumption, amount: head.amount, rate: head.rate, units: 1 }));
        quantity = 1;
        rate = amount;
        break;
      }
      case 'PERCENTAGE':
        percentageHeads.push(head);
        continue;
      default:
        continue;
    }
    if (amount <= 0) continue;
    const taxAmount = round2((amount * (head.taxRate ?? 0)) / 100);
    items.push({ chargeHeadId: head._id, code: head.code, description: head.name, quantity, rate, amount, taxRate: head.taxRate ?? 0, taxAmount, total: round2(amount + taxAmount), meterReadingId, ledgerAccountCode: head.ledgerAccountCode, fundKey: head.fundKey });
  }
  const base = items.reduce((s, i) => s + i.amount, 0);
  for (const head of percentageHeads) {
    const amount = round2((base * head.rate) / 100);
    if (amount <= 0) continue;
    const taxAmount = round2((amount * (head.taxRate ?? 0)) / 100);
    items.push({ chargeHeadId: head._id, code: head.code, description: head.name, quantity: 1, rate: head.rate, amount, taxRate: head.taxRate ?? 0, taxAmount, total: round2(amount + taxAmount), meterReadingId: null, ledgerAccountCode: head.ledgerAccountCode, fundKey: head.fundKey });
  }
  return { items, readingIds };
}

export interface PenaltyConfig {
  type: 'FLAT' | 'PERCENT' | 'INTEREST_PA';
  value: number;
  applyAfterDays?: number;
  maxAmount?: number | null;
}

/** Late-payment penalty as configured by the society (applied once when the invoice turns overdue). */
export function computePenalty(balanceDue: number, daysOverdue: number, cfg: PenaltyConfig): number {
  if (!cfg || !cfg.value || balanceDue <= 0) return 0;
  let penalty = 0;
  if (cfg.type === 'FLAT') penalty = cfg.value;
  else if (cfg.type === 'PERCENT') penalty = (balanceDue * cfg.value) / 100;
  else if (cfg.type === 'INTEREST_PA') penalty = (balanceDue * cfg.value * Math.max(daysOverdue, 1)) / 100 / 365;
  if (cfg.maxAmount != null && cfg.maxAmount > 0) penalty = Math.min(penalty, cfg.maxAmount);
  return round2(penalty);
}

export function totalsFor(items: LineItemDraft[], discount = 0, penalty = 0, roundOff = true): { subtotal: number; taxTotal: number; total: number } {
  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const taxTotal = round2(items.reduce((s, i) => s + i.taxAmount, 0));
  const raw = subtotal + taxTotal - discount + penalty;
  return { subtotal, taxTotal, total: roundOff ? Math.round(raw) : round2(raw) };
}
