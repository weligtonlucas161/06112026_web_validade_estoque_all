import React, { useMemo, useState } from 'react';
import {
  Edit3,
  FileSpreadsheet,
  Minus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { ProductBatch } from '../types';
import { formatDateBR } from '../utils/expiry';
import { XlsxImportModal } from './XlsxImportModal';

interface StockViewProps {
  products: ProductBatch[];
  onQuickUpdate: (id: string, patch: Partial<ProductBatch>) => Promise<void>;
  onEditProduct: (product: ProductBatch) => void;
  onNewProduct: () => void;
  onRefresh: () => Promise<void>;
}

export const StockView: React.FC<StockViewProps> = ({
  products,
  onQuickUpdate,
  onEditProduct,
  onNewProduct,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const activeProducts = useMemo(
    () => products.filter((p) => p.status !== 'descartado'),
    [products]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.reducedCode && p.reducedCode.toLowerCase().includes(q)) ||
        (p.supplierCode && p.supplierCode.toLowerCase().includes(q)) ||
        p.supplier.toLowerCase().includes(q)
    );
  }, [activeProducts, searchQuery]);

  const totalUnits = useMemo(
    () => activeProducts.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0),
    [activeProducts]
  );

  const zeroStockCount = useMemo(
    () => activeProducts.filter((p) => p.quantity <= 0).length,
    [activeProducts]
  );

  return (
    <div className="space-y-6">
      {/* Stock Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Itens Cadastrados
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {activeProducts.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            SKUs ativos no mercado
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Volume Total em Estoque
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {totalUnits}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Unidades / kg / litros somados
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Estoque Zerado
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono text-red-600 dark:text-red-400 tabular-nums">
            {zeroStockCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Necessitam reposição
          </p>
        </div>
      </div>

      {/* Toolbar: Search + Import .xlsx + New Product */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por descrição, código reduzido, código de barras ou fornecedor..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[40px]"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Importar Planilha (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={onNewProduct}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-700 transition-colors min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Produto</span>
          </button>
        </div>
      </div>

      {/* Stock Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nenhum produto encontrado no estoque.
            </p>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Importar Planilha .xlsx
            </button>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                    <th className="py-3 px-4">Cód. Reduzido</th>
                    <th className="py-3 px-4">Descrição do Produto / Nome</th>
                    <th className="py-3 px-4">Cód. Fornecedor</th>
                    <th className="py-3 px-4">Código de Barras</th>
                    <th className="py-3 px-4 text-right">Quantidade</th>
                    <th className="py-3 px-4">Validade</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {p.reducedCode || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.brand} · {p.location}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {p.supplierCode || p.supplier}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {p.barcode}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                          <button
                            type="button"
                            onClick={() =>
                              onQuickUpdate(p.id, {
                                quantity: Math.max(0, p.quantity - 1),
                              })
                            }
                            className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span
                            className={`min-w-[48px] text-center font-semibold ${
                              p.quantity <= 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {p.quantity} {p.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onQuickUpdate(p.id, {
                                quantity: p.quantity + 1,
                              })
                            }
                            className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatDateBR(p.expirationDate)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditProduct(p)}
                            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg"
                            title="Editar produto"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onQuickUpdate(p.id, { status: 'descartado' })
                            }
                            className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
                            title="Remover do estoque"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stock Cards */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((p) => (
                <div key={p.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {p.name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        Red: {p.reducedCode || '—'} · EAN: {p.barcode}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                      {p.quantity} {p.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Forn: {p.supplierCode || p.supplier}</span>
                    <button
                      type="button"
                      onClick={() => onEditProduct(p)}
                      className="text-emerald-600 dark:text-emerald-400 font-semibold"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <XlsxImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onRefresh}
      />
    </div>
  );
};
