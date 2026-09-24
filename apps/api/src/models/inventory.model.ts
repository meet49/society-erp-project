import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField, softDeleteFields } from './base';

export const StockTransactionTypes = ['IN', 'OUT', 'ADJUST'] as const;
export const StockReferenceTypes = ['PURCHASE_ORDER', 'EXPENSE', 'COMPLAINT', 'ASSET', 'MANUAL'] as const;

/** Consumables and spares held in the society store, valued at moving-average cost. */
const inventoryItemSchema = new Schema(
  {
    societyId: societyField,
    sku: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    categoryKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    unit: { type: String, trim: true, default: 'nos', maxlength: 20 },
    currentStock: { type: Number, default: 0 },
    minimumLevel: { type: Number, default: 0, min: 0 },
    reorderQuantity: { type: Number, default: 0, min: 0 },
    location: { type: String, trim: true, maxlength: 120 },
    unitCost: { type: Number, default: 0, min: 0 },
    vendorId: { type: ObjectIdType, ref: 'Vendor', default: null },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    lowStockAlertedAt: { type: Date, default: null },
    createdBy: { type: ObjectIdType, ref: 'User' },
    ...softDeleteFields,
  },
  baseOptions,
);
inventoryItemSchema.index({ societyId: 1, sku: 1 }, { unique: true });
inventoryItemSchema.index({ name: 'text', sku: 'text' });

export type InventoryItemDoc = HydratedDocumentFromSchema<typeof inventoryItemSchema>;
export const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);

/** Every stock movement, with the balance after it, so the ledger can always be rebuilt. */
const stockTransactionSchema = new Schema(
  {
    societyId: societyField,
    itemId: { type: ObjectIdType, ref: 'InventoryItem', required: true, index: true },
    type: { type: String, enum: StockTransactionTypes, required: true },
    /** signed movement: positive for IN and upward adjustments, negative for OUT */
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    balanceAfter: { type: Number, required: true },
    reference: { type: { type: String, enum: StockReferenceTypes, default: 'MANUAL' }, id: { type: ObjectIdType, default: null }, label: { type: String, trim: true, maxlength: 120 } },
    issuedTo: { type: String, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 500 },
    byUserId: { type: ObjectIdType, ref: 'User', default: null },
    at: { type: Date, default: Date.now, index: true },
    clientRef: { type: String, default: null },
  },
  baseOptions,
);
stockTransactionSchema.index({ societyId: 1, itemId: 1, at: -1 });
stockTransactionSchema.index({ societyId: 1, clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });

export type StockTransactionDoc = HydratedDocumentFromSchema<typeof stockTransactionSchema>;
export const StockTransaction = mongoose.model('StockTransaction', stockTransactionSchema);
