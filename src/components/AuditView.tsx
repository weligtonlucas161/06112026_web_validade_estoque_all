import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  ScanBarcode,
  Search,
} from 'lucide-react';
import type {
  AuditItemRecord,
  AuditSession,
  AuditType,
  PresenceStatus,
  ProductBatch,
} from '../types';
import { formatDateBR, formatExpiryLabel, getExpirySeverity } from '../utils/expiry';

interface AuditViewProps {
  products: ProductBatch[];
  audits: AuditSession[];
  onSaveAudit: (session: Omit<AuditSession, 'id' | 'createdAt'>) => Promise<void>;
  onOpenAuditScanner: (onScanned: (barcode: string) => void) => void;
}

export const AuditView: React.FC<AuditViewProps> = ({
  products,
  audits,
  onSaveAudit,
  onOpenAuditScanner,
}) => {
  const activeProducts = useMemo(
    () => products.filter((p) => p.status !== 'descartado'),
    [products]
  );

  const [auditType, setAuditType] = useState<AuditType>('presenca');
  const [auditorName, setAuditorName] = useState('Operador de Loja');
  const [sector, setSector] = useState('Todos os Corredores');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedBarcode, setHighlightedBarcode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // Local audit draft state per productId
  const [presenceDraft, setPresenceDraft] = useState<Record<string, PresenceStatus>>({});
  const [expiryDraft, setExpiryDraft] = useState<Record<string, string>>({});
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const [auditedIds, setAuditedIds] = useState<Record<string, boolean>>({});

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeProducts.filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [activeProducts, searchQuery]);

  const markItemAudited = (productId: string) => {
    setAuditedIds((prev) => ({ ...prev, [productId]: true }));
  };

  const handleScanInAudit = () => {
    onOpenAuditScanner((barcode) => {
      setSearchQuery(barcode);
      setHighlightedBarcode(barcode);
      const found = activeProducts.find((p) => p.barcode === barcode);
      if (found) {
        markItemAudited(found.id);
      }
    });
  };

  const auditedCount = useMemo(
    () => activeProducts.filter((p) => auditedIds[p.id]).length,
    [activeProducts, auditedIds]
  );

  const handleFinishAudit = async () => {
    setSaving(true);
    setSavedBanner(null);
    try {
      const items: AuditItemRecord[] = activeProducts.map((p) => {
        const presence = presenceDraft[p.id] ?? p.presenceStatus;
        const verifiedExpiry = expiryDraft[p.id] ?? p.expirationDate;
        const countedQty =
          typeof qtyDraft[p.id] === 'number' ? qtyDraft[p.id] : p.quantity;

        let divergence = false;
        if (auditType === 'presenca') {
          divergence = presence !== 'presente';
        } else if (auditType === 'validade') {
          const sev = getExpirySeverity(verifiedExpiry);
          divergence =
            verifiedExpiry !== p.expirationDate ||
            sev === 'vencido' ||
            sev === 'critico';
        } else if (auditType === 'inventario') {
          divergence = countedQty !== p.quantity;
        }

        return {
          productId: p.id,
          barcode: p.barcode,
          productName: p.name,
          expectedQty: p.quantity,
          countedQty,
          expectedExpiry: p.expirationDate,
          verifiedExpiry,
          presence,
          divergence,
        };
      });

      const divergencesCount = items.filter((i) => i.divergence).length;

      await onSaveAudit({
        type: auditType,
        auditorName: auditorName.trim() || 'Operador',
        sector,
        totalItems: items.length,
        divergencesCount,
        items,
      });

      setAuditedIds({});
      setSavedBanner(
        `Auditoria de ${
          auditType === 'presenca'
            ? 'Presença'
            : auditType === 'validade'
            ? 'Validade'
            : 'Inventário'
        } salva com ${divergencesCount} divergência(s) registrada(s).`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Selector & Controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setAuditType('presenca')}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-colors min-h-[40px] whitespace-nowrap ${
                auditType === 'presenca'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <PackageCheck className="w-4 h-4 shrink-0" />
              <span>Presença</span>
            </button>
            <button
              type="button"
              onClick={() => setAuditType('validade')}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-colors min-h-[40px] whitespace-nowrap ${
                auditType === 'validade'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <CalendarCheck className="w-4 h-4 shrink-0" />
              <span>Validade</span>
            </button>
            <button
              type="button"
              onClick={() => setAuditType('inventario')}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-colors min-h-[40px] whitespace-nowrap ${
                auditType === 'inventario'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span>Inventário</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleScanInAudit}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[40px]"
            >
              <ScanBarcode className="w-4 h-4 text-emerald-600" />
              <span>Bipar Produto</span>
            </button>
            <button
              type="button"
              onClick={handleFinishAudit}
              disabled={saving || activeProducts.length === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors min-h-[40px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Salvando...' : 'Finalizar Auditoria'}</span>
            </button>
          </div>
        </div>

        {/* Auditor & Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Responsável pela Auditoria
            </label>
            <input
              type="text"
              value={auditorName}
              onChange={(e) => setAuditorName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Setor / Corredor
            </label>
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Filtrar por EAN ou Nome ({auditedCount}/{activeProducts.length} conferidos)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar código ou produto..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {savedBanner && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savedBanner}</span>
          </div>
        )}
      </div>

      {/* Audit Checklist */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {auditType === 'presenca' && 'Conferência de Presença na Gôndola'}
            {auditType === 'validade' && 'Inspeção de Validade e Lotes (PVPS)'}
            {auditType === 'inventario' && 'Contagem Física de Inventário'}
          </h3>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            {filteredProducts.length} itens
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredProducts.map((product) => {
            const isHighlighted = highlightedBarcode === product.barcode;
            const currentPresence = presenceDraft[product.id] ?? product.presenceStatus;
            const currentExpiry = expiryDraft[product.id] ?? product.expirationDate;
            const currentQty =
              typeof qtyDraft[product.id] === 'number'
                ? qtyDraft[product.id]
                : product.quantity;
            const diffQty = currentQty - product.quantity;

            return (
              <div
                key={product.id}
                className={`p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                  isHighlighted
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {product.name}
                    </span>
                    {auditedIds[product.id] && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{product.barcode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{product.brand}</span>
                    <span aria-hidden="true">·</span>
                    <span>{product.location}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Estoque: {product.quantity} {product.unit}
                    </span>
                  </div>
                </div>

                {/* Mode-specific interactive control */}
                <div className="flex items-center gap-2 shrink-0">
                  {auditType === 'presenca' && (
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                      {(
                        [
                          { id: 'presente', label: 'Presente' },
                          { id: 'reposicao', label: 'Reposição' },
                          { id: 'ruptura', label: 'Ruptura' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setPresenceDraft((prev) => ({
                              ...prev,
                              [product.id]: opt.id,
                            }));
                            markItemAudited(product.id);
                          }}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors min-h-[36px] ${
                            currentPresence === opt.id
                              ? opt.id === 'ruptura'
                                ? 'bg-red-600 text-white'
                                : opt.id === 'reposicao'
                                ? 'bg-amber-600 text-white'
                                : 'bg-emerald-600 text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {auditType === 'validade' && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatExpiryLabel(currentExpiry)}
                      </span>
                      <input
                        type="date"
                        value={currentExpiry}
                        onChange={(e) => {
                          setExpiryDraft((prev) => ({
                            ...prev,
                            [product.id]: e.target.value,
                          }));
                          markItemAudited(product.id);
                        }}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[38px]"
                      />
                    </div>
                  )}

                  {auditType === 'inventario' && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Contado:
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={currentQty}
                        onChange={(e) => {
                          setQtyDraft((prev) => ({
                            ...prev,
                            [product.id]: Number(e.target.value),
                          }));
                          markItemAudited(product.id);
                        }}
                        className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-right text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[38px]"
                      />
                      <span
                        className={`text-xs font-mono tabular-nums w-14 text-right ${
                          diffQty === 0
                            ? 'text-slate-400'
                            : diffQty > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {diffQty > 0 ? `+${diffQty}` : diffQty}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit History */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Histórico de Auditorias Realizadas
          </h3>
        </div>
        {audits.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhuma auditoria registrada ainda.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {audits.map((audit) => (
              <div
                key={audit.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Auditoria de{' '}
                    {audit.type === 'presenca'
                      ? 'Presença'
                      : audit.type === 'validade'
                      ? 'Validade'
                      : 'Inventário'}{' '}
                    — {audit.sector}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {audit.auditorName} · {formatDateBR(audit.createdAt)} ·{' '}
                    <span className="font-mono tabular-nums">{audit.totalItems} itens</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                  {audit.divergencesCount > 0 ? (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {audit.divergencesCount} divergência(s)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      100% conforme
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
