'use client';

/**
 * components/hud/AddTransactionModal.tsx
 *
 * Thin re-export for backwards compatibility.
 * The unified TransactionModal (supporting both create and edit) lives in
 * components/hud/TransactionModal.tsx.
 *
 * Existing imports of AddTransactionModal continue to work — the component
 * renders in create mode (no `transaction` prop) exactly as before.
 */

export { TransactionModal as AddTransactionModal } from '@/components/hud/TransactionModal';
