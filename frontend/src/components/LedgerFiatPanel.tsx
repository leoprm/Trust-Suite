import { useEffect, useState, useCallback } from 'react';
import type React from 'react';
import {
  Plus,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Upload,
  RefreshCw,
  Search,
  BarChart2,
  ShieldCheck,
  X,
  Info,
} from 'lucide-react';
import api from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VerificationStatus =
  | 'DECLARED' | 'BACKED_BY_RECEIPT' | 'RECONCILED' | 'AUDITED' | 'API_VERIFIED' | 'REJECTED';

type TransactionType =
  | 'INCOME' | 'EXPENSE' | 'INVESTMENT'
  | 'SALARY' | 'MATERIALS' | 'INFRASTRUCTURE'
  | 'TAX' | 'RESERVE' | 'MAINTENANCE'
  | 'TREE_FUND' | 'EXTERNAL_CONTRACT' | 'REFUND';

type TransactionCategory =
  | 'WATER' | 'ELECTRICITY' | 'GAS' | 'MORTGAGE' | 'FUEL'
  | 'SHOPPING' | 'EQUIPMENT' | 'MATERIAL' | 'MONEY' | 'OTHER';

type CounterpartyType = 'CLIENT' | 'SUPPLIER' | 'MEMBER' | 'EXTERNAL_WORKER' | 'INSTITUTION' | 'OTHER';

interface Transaction {
  id:                  string;
  treeId:              string;
  branchId:            string | null;
  taskId:              string | null;
  externalNeedId:      string | null;
  solutionProposalId:  string | null;
  createdById:         string | null;
  certifiedById:       string | null;
  amount:              number;
  currency:            string;
  type:                TransactionType;
  category:            TransactionCategory;
  description:         string | null;
  counterpartyName:    string | null;
  counterpartyType:    CounterpartyType | null;
  verificationStatus:  VerificationStatus;
  receiptEvidenceId:   string | null;
  rejectionReason:     string | null;
  certifiedAt:         string | null;
  isAutomatic:         boolean;
  date:                string;
  createdAt:           string;
  updatedAt:           string;
  createdBy:           { id: string; username: string } | null;
  certifiedBy:         { id: string; username: string } | null;
  receiptMetadata:     any;
  note:                string;
}

interface PagedResult {
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  items:      Transaction[];
}

interface LedgerSummary {
  treeId:              string;
  branchId:            string | null;
  totalTransactions:   number;
  totalIncomeFiat:     number;
  totalExpenseFiat:    number;
  totalInvestmentFiat: number;
  netFiat:             number;
  verifiedAmountFiat:  number;
  verifiedRatioPct:    number;
  byType:              Record<string, number>;
  byVerificationStatus:Record<string, number>;
  note:                string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALL_TYPES: TransactionType[] = [
  'INCOME', 'EXPENSE', 'INVESTMENT', 'SALARY', 'MATERIALS',
  'INFRASTRUCTURE', 'TAX', 'RESERVE', 'MAINTENANCE',
  'TREE_FUND', 'EXTERNAL_CONTRACT', 'REFUND',
];

const ALL_CATEGORIES: TransactionCategory[] = [
  'WATER', 'ELECTRICITY', 'GAS', 'MORTGAGE', 'FUEL',
  'SHOPPING', 'EQUIPMENT', 'MATERIAL', 'MONEY', 'OTHER',
];

const ALL_STATUSES: VerificationStatus[] = [
  'DECLARED', 'BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED', 'REJECTED',
];

const COUNTERPARTY_TYPES: CounterpartyType[] = [
  'CLIENT', 'SUPPLIER', 'MEMBER', 'EXTERNAL_WORKER', 'INSTITUTION', 'OTHER',
];

const TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Ingreso', EXPENSE: 'Gasto', INVESTMENT: 'Inversión',
  SALARY: 'Salario', MATERIALS: 'Materiales', INFRASTRUCTURE: 'Infraestructura',
  TAX: 'Impuesto', RESERVE: 'Reserva', MAINTENANCE: 'Mantenimiento',
  TREE_FUND: 'Fondo Tree', EXTERNAL_CONTRACT: 'Contrato Externo', REFUND: 'Reembolso',
};

const STATUS_LABELS: Record<VerificationStatus, string> = {
  DECLARED: 'Declarada', BACKED_BY_RECEIPT: 'Con Comprobante',
  RECONCILED: 'Conciliada', AUDITED: 'Auditada',
  API_VERIFIED: 'Verificada API', REJECTED: 'Rechazada',
};

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  WATER: 'Agua', ELECTRICITY: 'Electricidad', GAS: 'Gas',
  MORTGAGE: 'Hipoteca/Arriendo', FUEL: 'Combustible', SHOPPING: 'Compras',
  EQUIPMENT: 'Equipamiento', MATERIAL: 'Material', MONEY: 'Dinero/Labor', OTHER: 'Otro',
};

const COUNTERPARTY_LABELS: Record<CounterpartyType, string> = {
  CLIENT: 'Cliente', SUPPLIER: 'Proveedor', MEMBER: 'Miembro',
  EXTERNAL_WORKER: 'Trabajador externo', INSTITUTION: 'Institución', OTHER: 'Otro',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const colors: Record<VerificationStatus, string> = {
    DECLARED:          'bg-gray-100 text-gray-700',
    BACKED_BY_RECEIPT: 'bg-blue-100 text-blue-700',
    RECONCILED:        'bg-purple-100 text-purple-700',
    AUDITED:           'bg-green-100 text-green-700',
    API_VERIFIED:      'bg-orange-100 text-orange-700',
    REJECTED:          'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {status === 'REJECTED' && <XCircle className="h-3 w-3" />}
      {status === 'AUDITED'  && <CheckCircle2 className="h-3 w-3" />}
      {status === 'DECLARED' && <Clock className="h-3 w-3" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: TransactionType }) {
  const incomeTypes: TransactionType[] = ['INCOME', 'EXTERNAL_CONTRACT', 'REFUND'];
  const isIncome = incomeTypes.includes(type);
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Transaction Form
// ─────────────────────────────────────────────────────────────────────────────

interface CreateFormProps {
  treeId: string;
  branchId?: string;
  onCreated: () => void;
  onCancel: () => void;
}

function CreateTransactionForm({ treeId, branchId, onCreated, onCancel }: CreateFormProps) {
  const [form, setForm] = useState({
    type: 'EXPENSE' as TransactionType,
    category: 'OTHER' as TransactionCategory,
    amount: '',
    currency: 'CLP',
    description: '',
    counterpartyName: '',
    counterpartyType: '' as CounterpartyType | '',
    date: new Date().toISOString().split('T')[0],
    branchId: branchId ?? '',
    externalNeedId: '',
    solutionProposalId: '',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.amount || Number(form.amount) <= 0) {
      setError('El monto debe ser positivo'); return;
    }
    setLoading(true);
    try {
      await api.post(`/trees/${treeId}/ledger/fiat/transactions`, {
        ...form,
        treeId,
        amount: Number(form.amount),
        branchId:           form.branchId || null,
        externalNeedId:     form.externalNeedId || null,
        solutionProposalId: form.solutionProposalId || null,
        counterpartyType:   form.counterpartyType || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Error al crear transacción');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h4 className="font-semibold text-gray-800">Nueva Transacción Fiat</h4>

      {error && (
        <div className="flex items-center gap-2 rounded bg-red-50 p-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tipo *</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none">
            {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Categoría</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none">
            {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Monto *</label>
          <input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount}
            onChange={e => set('amount', e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Moneda</label>
          <input type="text" maxLength={3} placeholder="CLP" value={form.currency}
            onChange={e => set('currency', e.target.value.toUpperCase())}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Descripción</label>
          <input type="text" placeholder="Descripción opcional" value={form.description}
            onChange={e => set('description', e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Contraparte</label>
          <input type="text" placeholder="Nombre contraparte" value={form.counterpartyName}
            onChange={e => set('counterpartyName', e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tipo contraparte</label>
          <select value={form.counterpartyType} onChange={e => set('counterpartyType', e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none">
            <option value="">— Sin especificar —</option>
            {COUNTERPARTY_TYPES.map(c => <option key={c} value={c}>{COUNTERPARTY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
        </div>
        {!branchId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">ID Rama (opcional)</label>
            <input type="text" placeholder="branchId" value={form.branchId}
              onChange={e => set('branchId', e.target.value)}
              className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear
        </button>
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
          Cancelar
        </button>
      </div>

      <p className="rounded bg-yellow-50 p-2 text-xs text-yellow-800">
        <strong>Norma constitucional:</strong> El fiat certifica transacciones externas. No otorga XP, autoridad, votos ni Berries.
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Certify Modal
// ─────────────────────────────────────────────────────────────────────────────

interface CertifyModalProps {
  tx: Transaction;
  onDone: () => void;
  onCancel: () => void;
}

const CERTIFY_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  DECLARED:          ['BACKED_BY_RECEIPT', 'REJECTED'],
  BACKED_BY_RECEIPT: ['RECONCILED', 'REJECTED'],
  RECONCILED:        ['AUDITED', 'REJECTED'],
  AUDITED:           [],
  API_VERIFIED:      [],
  REJECTED:          [],
};

function CertifyModal({ tx, onDone, onCancel }: CertifyModalProps) {
  const options = CERTIFY_TRANSITIONS[tx.verificationStatus] ?? [];
  const [toStatus, setToStatus] = useState<VerificationStatus>(options[0] ?? 'REJECTED');
  const [reason, setReason]     = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  if (!options.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">Esta transacción está en estado <strong>{STATUS_LABELS[tx.verificationStatus]}</strong> y no puede avanzar.</p>
        <button onClick={onCancel} className="mt-2 text-sm text-blue-600 hover:underline">Cerrar</button>
      </div>
    );
  }

  const handleCertify = async () => {
    setError('');
    if (toStatus === 'REJECTED' && reason.trim().length < 5) {
      setError('Se requiere un motivo de rechazo (mínimo 5 caracteres)'); return;
    }
    setLoading(true);
    try {
      await api.post(`/ledger/fiat/transactions/${tx.id}/certify`, { toStatus, reason: reason || undefined });
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Error al certificar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h5 className="font-semibold text-gray-800">Cambiar estado de certificación</h5>
      <p className="text-xs text-gray-500">Estado actual: <StatusBadge status={tx.verificationStatus} /></p>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Nuevo estado</label>
        <select value={toStatus} onChange={e => setToStatus(e.target.value as VerificationStatus)}
          className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none">
          {options.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      {toStatus === 'REJECTED' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Motivo de rechazo *</label>
          <input type="text" placeholder="Describe el motivo..." value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleCertify} disabled={loading}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Confirmar
        </button>
        <button onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt Upload Panel
// ─────────────────────────────────────────────────────────────────────────────

function ReceiptUploadPanel({ txId, onDone, onCancel }: { txId: string; onDone: () => void; onCancel: () => void }) {
  const [file, setFile]       = useState<File | null>(null);
  const [fileId, setFileId]   = useState('');
  const [visibility, setVis]  = useState('TREE_ONLY');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    setError('');
    setLoading(true);
    try {
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('visibility', visibility);
        await api.post(`/ledger/fiat/transactions/${txId}/receipt`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else if (fileId.trim()) {
        await api.post(`/ledger/fiat/transactions/${txId}/receipt`, { evidenceFileId: fileId.trim() });
      } else {
        setError('Selecciona un archivo o ingresa un ID de comprobante existente'); setLoading(false); return;
      }
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Error al adjuntar comprobante');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h5 className="flex items-center gap-2 font-semibold text-blue-800"><Upload className="h-4 w-4" />Adjuntar Comprobante</h5>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Subir archivo</label>
        <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.docx,.xlsx"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm" />
        {file && (
          <div>
            <label className="mb-1 mt-2 block text-xs font-medium text-gray-600">Visibilidad</label>
            <select value={visibility} onChange={e => setVis(e.target.value)}
              className="rounded border border-gray-300 p-1.5 text-sm">
              <option value="TREE_ONLY">Solo miembros del Tree</option>
              <option value="TRUST_NETWORK">Red de confianza</option>
              <option value="PRIVATE">Privado (solo uploader)</option>
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">— o ID de comprobante existente —</label>
        <input type="text" placeholder="UUID del EvidenceFile" value={fileId}
          onChange={e => setFileId(e.target.value)}
          className="w-full rounded border border-gray-300 p-2 text-sm focus:border-blue-400 focus:outline-none" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleUpload} disabled={loading}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Adjuntar
        </button>
        <button onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Row / Detail
// ─────────────────────────────────────────────────────────────────────────────

interface TxRowProps {
  tx: Transaction;
  isAdmin: boolean;
  onRefresh: () => void;
}

function TransactionRow({ tx, isAdmin, onRefresh }: TxRowProps) {
  const [expanded, setExpanded]         = useState(false);
  const [showCertify, setShowCertify]   = useState(false);
  const [showReceipt, setShowReceipt]   = useState(false);

  const d = new Date(tx.date);
  const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-gray-50"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="w-20 shrink-0 text-xs text-gray-500">{dateStr}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={tx.type} />
            <span className="text-sm font-medium text-gray-800">
              {fmt(tx.amount, tx.currency)}
            </span>
            {tx.description && <span className="truncate text-xs text-gray-500">{tx.description}</span>}
          </div>
        </div>
        <StatusBadge status={tx.verificationStatus} />
        {tx.receiptEvidenceId && <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" title="Con comprobante" />}
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
      </div>

      {expanded && (
        <div className="space-y-3 bg-gray-50 px-4 pb-4 pt-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-gray-500">Categoría</span>
            <span>{CATEGORY_LABELS[tx.category] ?? tx.category}</span>
            <span className="text-gray-500">Moneda</span>
            <span>{tx.currency}</span>
            {tx.counterpartyName && <>
              <span className="text-gray-500">Contraparte</span>
              <span>{tx.counterpartyName}{tx.counterpartyType ? ` (${COUNTERPARTY_LABELS[tx.counterpartyType as CounterpartyType] ?? tx.counterpartyType})` : ''}</span>
            </>}
            {tx.createdBy && <>
              <span className="text-gray-500">Creado por</span>
              <span>{tx.createdBy.username}</span>
            </>}
            {tx.certifiedBy && <>
              <span className="text-gray-500">Certificado por</span>
              <span>{tx.certifiedBy.username} {tx.certifiedAt ? `(${new Date(tx.certifiedAt).toLocaleDateString('es-CL')})` : ''}</span>
            </>}
            {tx.rejectionReason && <>
              <span className="text-gray-500">Motivo rechazo</span>
              <span className="text-red-700">{tx.rejectionReason}</span>
            </>}
            {tx.branchId && <>
              <span className="text-gray-500">Rama</span>
              <span className="truncate font-mono text-xs">{tx.branchId}</span>
            </>}
          </div>

          {/* Receipt metadata */}
          {tx.receiptMetadata && (
            <div className="rounded border border-blue-100 bg-blue-50 p-2 text-xs">
              <div className="flex items-center gap-1 font-medium text-blue-700 mb-1">
                <FileText className="h-3.5 w-3.5" /> Comprobante adjunto
              </div>
              {tx.receiptMetadata.hasReceipt ? (
                <div className="space-y-0.5 text-gray-600">
                  <p>Archivo: {tx.receiptMetadata.originalName}</p>
                  <p>Tipo: {tx.receiptMetadata.mimeType} · {Math.round((tx.receiptMetadata.sizeBytes ?? 0) / 1024)} KB</p>
                  {tx.receiptMetadata.checksumSha256 && (
                    <p className="font-mono text-[10px] text-gray-400">SHA256: {tx.receiptMetadata.checksumSha256.slice(0, 16)}…</p>
                  )}
                  {tx.receiptMetadata.fileAccessAllowed && tx.receiptMetadata.downloadUrl && (
                    <a href={`${import.meta.env.VITE_API_URL ?? '/api'}${tx.receiptMetadata.downloadUrl}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-block rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 mt-1">
                      Ver comprobante
                    </a>
                  )}
                  {!tx.receiptMetadata.fileAccessAllowed && (
                    <p className="text-gray-500 italic">Sin acceso al archivo (según visibilidad)</p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">Sin metadatos de comprobante</p>
              )}
            </div>
          )}

          {/* Actions */}
          {isAdmin && !showCertify && !showReceipt && (
            <div className="flex flex-wrap gap-2">
              {!tx.receiptEvidenceId && (
                <button onClick={() => setShowReceipt(true)}
                  className="flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
                  <Upload className="h-3.5 w-3.5" />Adjuntar comprobante
                </button>
              )}
              {CERTIFY_TRANSITIONS[tx.verificationStatus]?.length > 0 && (
                <button onClick={() => setShowCertify(true)}
                  className="flex items-center gap-1 rounded border border-purple-300 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50">
                  <ShieldCheck className="h-3.5 w-3.5" />Certificar
                </button>
              )}
            </div>
          )}

          {showCertify && (
            <CertifyModal tx={tx}
              onDone={() => { setShowCertify(false); onRefresh(); }}
              onCancel={() => setShowCertify(false)} />
          )}
          {showReceipt && (
            <ReceiptUploadPanel txId={tx.id}
              onDone={() => { setShowReceipt(false); onRefresh(); }}
              onCancel={() => setShowReceipt(false)} />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Tab
// ─────────────────────────────────────────────────────────────────────────────

function SummaryTab({ treeId, branchId }: { treeId: string; branchId?: string }) {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    const url = branchId
      ? `/branches/${branchId}/ledger/fiat/summary`
      : `/trees/${treeId}/ledger/fiat/summary`;
    api.get(url)
      .then(r => setSummary(r.data))
      .catch(e => setError(e.response?.data?.error ?? 'Error al cargar resumen'))
      .finally(() => setLoading(false));
  }, [treeId, branchId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (error)   return <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!summary) return null;

  const net = summary.netFiat;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total ingresos', value: summary.totalIncomeFiat, color: 'text-emerald-700' },
          { label: 'Total gastos',   value: summary.totalExpenseFiat, color: 'text-amber-700' },
          { label: 'Inversiones',    value: summary.totalInvestmentFiat, color: 'text-blue-700' },
          { label: 'Neto',           value: net, color: net >= 0 ? 'text-emerald-700' : 'text-red-700' },
        ].map(k => (
          <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`mt-1 text-base font-bold ${k.color}`}>{fmt(k.value)}</p>
          </div>
        ))}
      </div>

      {/* Verification ratio */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <p className="text-xs text-gray-500">Trazabilidad ({summary.totalTransactions} txs)</p>
        <div className="mt-1 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(summary.verifiedRatioPct, 100)}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold text-gray-700">{summary.verifiedRatioPct.toFixed(1)}% verificado</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">Verificado = comprobante adjunto o superior</p>
      </div>

      {/* By type breakdown */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-gray-600">Por tipo de transacción</p>
        <div className="space-y-1">
          {Object.entries(summary.byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => (
            <div key={type} className="flex items-center justify-between text-xs">
              <TypeBadge type={type as TransactionType} />
              <span className="font-medium text-gray-700">{fmt(amount)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* By status breakdown */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-gray-600">Por estado de certificación</p>
        <div className="space-y-1">
          {Object.entries(summary.byVerificationStatus).map(([status, amount]) => (
            <div key={status} className="flex items-center justify-between text-xs">
              <StatusBadge status={status as VerificationStatus} />
              <span className="font-medium text-gray-700">{fmt(amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded bg-yellow-50 p-2 text-xs text-yellow-800">
        <Info className="inline h-3.5 w-3.5 mr-1" />{summary.note}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions Tab (with filters)
// ─────────────────────────────────────────────────────────────────────────────

interface TransactionTabProps {
  treeId: string;
  branchId?: string;
  isAdmin: boolean;
}

function TransactionsTab({ treeId, branchId, isAdmin }: TransactionTabProps) {
  const [result, setResult]         = useState<PagedResult | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]             = useState(1);

  // Filters
  const [filters, setFilters] = useState({
    type:               '',
    verificationStatus: '',
    category:           '',
    dateFrom:           '',
    dateTo:             '',
    search:             '',
  });

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (branchId)                    params.set('branchId', branchId);
    if (filters.type)               params.set('type', filters.type);
    if (filters.verificationStatus) params.set('verificationStatus', filters.verificationStatus);
    if (filters.category)           params.set('category', filters.category);
    if (filters.dateFrom)           params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)             params.set('dateTo', filters.dateTo);
    if (filters.search)             params.set('search', filters.search);
    params.set('page', String(page));
    params.set('pageSize', '20');
    return params.toString();
  }, [branchId, filters, page]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get(`/trees/${treeId}/ledger/fiat?${buildQuery()}`)
      .then(r => setResult(r.data))
      .catch(e => setError(e.response?.data?.error ?? 'Error al cargar transacciones'))
      .finally(() => setLoading(false));
  }, [treeId, buildQuery]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k: string, v: string) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const clearFilters = () => { setFilters({ type: '', verificationStatus: '', category: '', dateFrom: '', dateTo: '', search: '' }); setPage(1); };

  const hasFilters = Object.values(filters).some(v => v !== '');

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar..." value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              className="rounded border border-gray-300 pl-7 pr-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none w-36" />
          </div>
          <button onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-medium ${showFilters || hasFilters ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            <Filter className="h-3.5 w-3.5" />Filtros{hasFilters ? ' ●' : ''}
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <X className="h-3.5 w-3.5" />Limpiar
            </button>
          )}
          <button onClick={load} title="Recargar"
            className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />Nueva transacción
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Tipo</label>
            <select value={filters.type} onChange={e => setFilter('type', e.target.value)}
              className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-blue-400 focus:outline-none">
              <option value="">Todos</option>
              {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Estado</label>
            <select value={filters.verificationStatus} onChange={e => setFilter('verificationStatus', e.target.value)}
              className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-blue-400 focus:outline-none">
              <option value="">Todos</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Categoría</label>
            <select value={filters.category} onChange={e => setFilter('category', e.target.value)}
              className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-blue-400 focus:outline-none">
              <option value="">Todas</option>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Desde</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)}
              className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-blue-400 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Hasta</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)}
              className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-blue-400 focus:outline-none" />
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateTransactionForm treeId={treeId} branchId={branchId}
          onCreated={() => { setShowCreate(false); load(); }}
          onCancel={() => setShowCreate(false)} />
      )}

      {/* Transaction list */}
      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      )}
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!loading && result && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            {result.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No hay transacciones con los filtros actuales</p>
            ) : (
              result.items.map(tx => (
                <TransactionRow key={tx.id} tx={tx} isAdmin={isAdmin} onRefresh={load} />
              ))
            )}
          </div>

          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Página {result.page} de {result.totalPages} ({result.total} resultados)</span>
              <div className="flex gap-1">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 hover:bg-gray-50">Ant</button>
                <button disabled={page === result.totalPages} onClick={() => setPage(p => p + 1)}
                  className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 hover:bg-gray-50">Sig</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel export
// ─────────────────────────────────────────────────────────────────────────────

interface LedgerFiatPanelProps {
  treeId: string;
  branchId?: string;
  isAdmin?: boolean;
}

export default function LedgerFiatPanel({ treeId, branchId, isAdmin = false }: LedgerFiatPanelProps) {
  const [tab, setTab] = useState<'transactions' | 'summary'>('transactions');

  const tabs = [
    { key: 'transactions' as const, label: 'Transacciones', icon: FileText },
    { key: 'summary'      as const, label: 'Resumen',       icon: BarChart2 },
  ];

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'transactions' && (
        <TransactionsTab treeId={treeId} branchId={branchId} isAdmin={isAdmin} />
      )}
      {tab === 'summary' && (
        <SummaryTab treeId={treeId} branchId={branchId} />
      )}
    </div>
  );
}
