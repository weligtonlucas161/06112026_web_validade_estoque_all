import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Minus,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ProductBatch } from '../types';
import { formatDateBR } from '../utils/expiry';

interface StockViewProps {
  products: ProductBatch[];
  onQuickUpdate: (id: string, patch: Partial<ProductBatch>) => Promise<void>;
  onEditProduct: (product: ProductBatch) => void;
  onNewProduct: () => void;
  onRefresh: () => Promise<void>;
}

interface ImportColumnMapping {
  nameCol: number;
  supplierCodeCol: number;
  barcodeCol: number;
  reducedCodeCol: number;
  quantityCol: number;
}

interface ImportRowItem {
  name: string;
  supplierCode?: string;
  barcode: string;
  reducedCode?: string;
  quantity: number;
}

interface ImportApiResponse {
  ok: boolean;
  inserted?: number;
  updated?: number;
  total?: number;
  supabaseSynced?: boolean;
  error?: string;
}

const MAX_ROWS_LIMIT = 5000;
const CHUNK_SIZE = 50;

/**
 * Envia um chunk para a API com verificação estrita de Content-Type e estrutura JSON,
 * prevenindo erros de análise de token (Unexpected token 'T', páginas HTML 502/503, etc.).
 */
async function postChunkSafe(items: ImportRowItem[]): Promise<ImportApiResponse> {
  const res = await fetch('/api/products/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ items }),
  });

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();
  const trimmed = rawText.trim();

  // Verifica se a resposta tem formato JSON antes de tentar o parse
  const isLikelyJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!contentType.includes('application/json') && !isLikelyJson) {
    throw new Error(
      `O servidor retornou uma resposta não-JSON (HTTP ${res.status}). O bloco foi abortado com segurança.`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error(`Falha de análise do JSON retornado pelo servidor (HTTP ${res.status}).`);
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('A resposta recebida do servidor é inválida.');
  }

  const typed = data as ImportApiResponse;
  if (!res.ok || typed.ok === false) {
    throw new Error(typed.error || `Erro de processamento no servidor (HTTP ${res.status}).`);
  }

  return typed;
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

  // Estados da lógica de importação de planilhas
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [startRow, setStartRow] = useState<number>(2);
  const [endRow, setEndRow] = useState<number>(5001);
  const [mapping, setMapping] = useState<ImportColumnMapping>({
    reducedCodeCol: 1,
    nameCol: 2,
    supplierCodeCol: 3,
    barcodeCol: 4,
    quantityCol: 5,
  });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  } | null>(null);
  const [importFeedback, setImportFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

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

  // Cálculo e validação do intervalo de linhas
  const selectedRowsCount = Math.max(0, endRow - startRow + 1);
  const exceedsMaxRows = selectedRowsCount > MAX_ROWS_LIMIT;

  const maxDetectedCols = useMemo(() => {
    let max = 10;
    for (const r of rawRows.slice(0, 10)) {
      if (r.length > max) max = r.length;
    }
    return max;
  }, [rawRows]);

  // Itens fatiados e mapeados de acordo com startRow, endRow e colunas
  const mappedItems: ImportRowItem[] = useMemo(() => {
    if (exceedsMaxRows || startRow < 1 || endRow < startRow || rawRows.length === 0) {
      return [];
    }

    const startIdx = Math.max(0, startRow - 1);
    const endIdx = Math.min(rawRows.length, endRow);

    return rawRows
      .slice(startIdx, endIdx)
      .map((row) => {
        const getCell = (col1Based: number): string => {
          if (col1Based < 1) return '';
          const val = row[col1Based - 1];
          return val !== undefined && val !== null ? String(val).trim() : '';
        };

        const rawQty = getCell(mapping.quantityCol).replace(',', '.');
        const quantity = Number(rawQty) || 0;

        return {
          reducedCode: getCell(mapping.reducedCodeCol) || undefined,
          name: getCell(mapping.nameCol),
          supplierCode: getCell(mapping.supplierCodeCol) || undefined,
          barcode: getCell(mapping.barcodeCol),
          quantity,
        };
      })
      .filter((item) => item.name || item.barcode || item.reducedCode);
  }, [rawRows, startRow, endRow, exceedsMaxRows, mapping]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportFeedback(null);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];

    // raw: false mantém códigos de barra extensos formatados em string
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    setRawRows(rows);
    const initialStart = rows.length > 1 ? 2 : 1;
    setStartRow(initialStart);
    setEndRow(Math.min(rows.length, initialStart + MAX_ROWS_LIMIT - 1));
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      [
        'Cód. Reduzido',
        'Descrição do Produto',
        'Cód. Fornecedor',
        'Código de Barras',
        'Quantidade',
      ],
      ['1001', 'Arroz Branco Tipo 1 5kg', 'FORN-102', '7896006700012', 45],
      ['1002', 'Feijão Carioca 1kg', 'FORN-102', '7896006700029', 60],
      ['1003', 'Óleo de Soja 900ml', 'FORN-205', '7891107000123', 32],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, 'modelo-estoque-validamerc.xlsx');
  };

  // Processamento em Chunks (Bloqueios) seguro e assíncrono
  const handleExecuteImport = async () => {
    if (exceedsMaxRows) {
      setImportFeedback({
        ok: false,
        text: `O teto máximo por importação é de ${MAX_ROWS_LIMIT} linhas. Ajuste o intervalo selecionado.`,
      });
      return;
    }

    if (mappedItems.length === 0) {
      setImportFeedback({
        ok: false,
        text: 'Nenhum produto válido encontrado no intervalo de linhas e colunas informado.',
      });
      return;
    }

    setImporting(true);
    setImportFeedback(null);
    setImportProgress({ current: 0, total: mappedItems.length, percent: 0 });

    try {
      let totalInserted = 0;
      let totalUpdated = 0;
      let anySupabaseSynced = false;

      // Executa a importação fatiada em chunks de 50 itens
      for (let i = 0; i < mappedItems.length; i += CHUNK_SIZE) {
        const chunk = mappedItems.slice(i, i + CHUNK_SIZE);
        const result = await postChunkSafe(chunk);

        totalInserted += Number(result.inserted || 0);
        totalUpdated += Number(result.updated || 0);
        if (result.supabaseSynced) anySupabaseSynced = true;

        const currentCount = Math.min(i + chunk.length, mappedItems.length);
        const percent = Math.round((currentCount / mappedItems.length) * 100);
        setImportProgress({
          current: currentCount,
          total: mappedItems.length,
          percent,
        });
      }

      await onRefresh();
      setImportFeedback({
        ok: true,
        text: `Importação finalizada com sucesso! ${totalInserted} novo(s) e ${totalUpdated} atualizado(s) no estoque${
          anySupabaseSynced ? ' (sincronizado com Supabase)' : ''
        }.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha desconhecida na conexão';
      setImportFeedback({
        ok: false,
        text: `Falha na importação: ${msg}`,
      });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

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

      {/* Modal Refatorado de Importação em Chunks com Intervalo de Linhas */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Importar Planilha de Estoque (.xlsx)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Processamento seguro em blocos (chunks) com seleção de linhas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Seleção de Arquivo e Modelo */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {fileName ? `Arquivo: ${fileName}` : 'Selecione uma planilha .xlsx, .xls ou .csv'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {rawRows.length > 0
                      ? `${rawRows.length} linhas lidas da planilha · ${mappedItems.length} produtos válidos`
                      : '5 colunas mapeáveis: Descrição, Cód. Fornecedor, Cód. Barras, Cód. Reduzido e Quantidade'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Modelo .xlsx</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 min-h-[40px]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Escolher Arquivo</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Tratamento de Linhas de Início e Fim (Teto: 5000 linhas) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Intervalo de Linhas da Planilha (Teto: {MAX_ROWS_LIMIT} linhas)
                  </h4>
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      exceedsMaxRows
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {selectedRowsCount} linha(s) selecionada(s)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Começa na Linha (ex: 2)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, rawRows.length || 999999)}
                      value={startRow}
                      onChange={(e) =>
                        setStartRow(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Termina na Linha (ex: 502)
                    </label>
                    <input
                      type="number"
                      min={startRow}
                      max={Math.max(1, rawRows.length || 999999)}
                      value={endRow}
                      onChange={(e) =>
                        setEndRow(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {exceedsMaxRows && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    O intervalo selecionado ultrapassa o teto máximo de {MAX_ROWS_LIMIT} linhas por operação.
                  </p>
                )}
              </div>

              {/* Mapeamento das 5 Colunas (Número da Coluna ou 0 se não possuir) */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                  Mapeamento das 5 Colunas (Número da Coluna ou 0 caso não possua)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      1. Descrição / Nome (0 = não possui)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxDetectedCols + 20}
                      value={mapping.nameCol}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          nameCol: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      2. Cód. Fornecedor (0 = não possui)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxDetectedCols + 20}
                      value={mapping.supplierCodeCol}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          supplierCodeCol: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      3. Cód. Barras EAN (0 = não possui)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxDetectedCols + 20}
                      value={mapping.barcodeCol}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          barcodeCol: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      4. Cód. Reduzido (0 = não possui)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxDetectedCols + 20}
                      value={mapping.reducedCodeCol}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          reducedCodeCol: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      5. Quantidade (0 = não possui)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxDetectedCols + 20}
                      value={mapping.quantityCol}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          quantityCol: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Pré-visualização dos primeiros itens */}
              {mappedItems.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Pré-visualização (primeiros 5 itens mapeados)
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      Total a importar: {mappedItems.length}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                          <th className="py-2 px-3">Cód. Reduzido</th>
                          <th className="py-2 px-3">Descrição / Nome</th>
                          <th className="py-2 px-3">Cód. Fornecedor</th>
                          <th className="py-2 px-3">Código de Barras</th>
                          <th className="py-2 px-3 text-right">Qtd</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {mappedItems.slice(0, 5).map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-mono">{item.reducedCode || '—'}</td>
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                              {item.name || '—'}
                            </td>
                            <td className="py-2 px-3 font-mono">{item.supplierCode || '—'}</td>
                            <td className="py-2 px-3 font-mono">{item.barcode || '—'}</td>
                            <td className="py-2 px-3 font-mono text-right tabular-nums">
                              {item.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Barra de Progresso do Processamento em Chunks */}
              {importProgress && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                    <span>Processando em chunks e gravando no banco...</span>
                    <span className="font-mono tabular-nums">
                      {importProgress.percent}% ({importProgress.current}/{importProgress.total})
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-emerald-200 dark:bg-emerald-900/60 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all duration-150"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Mensagem de Resultado ou Erro */}
              {importFeedback && (
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                    importFeedback.ok
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                      : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
                  }`}
                >
                  {importFeedback.ok && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <span>{importFeedback.text}</span>
                </div>
              )}

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={importing || exceedsMaxRows || mappedItems.length === 0}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[40px]"
                >
                  {importing
                    ? 'Gravando Chunks...'
                    : `Importar ${mappedItems.length} Produto(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
