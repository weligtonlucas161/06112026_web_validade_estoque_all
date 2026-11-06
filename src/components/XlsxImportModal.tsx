import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';

interface XlsxImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
}

interface ColumnMapping {
  nameCol: number;
  supplierCodeCol: number;
  barcodeCol: number;
  reducedCodeCol: number;
  quantityCol: number;
}

export const XlsxImportModal: React.FC<XlsxImportModalProps> = ({
  isOpen,
  onClose,
  onImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [skipHeader, setSkipHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>({
    reducedCodeCol: 1,
    nameCol: 2,
    supplierCodeCol: 3,
    barcodeCol: 4,
    quantityCol: 5,
  });
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const maxCols = useMemo(() => {
    let max = 10;
    for (const r of rawRows.slice(0, 10)) {
      if (r.length > max) max = r.length;
    }
    return max;
  }, [rawRows]);

  const mappedItems = useMemo(() => {
    const startIdx = skipHeader ? 1 : 0;
    return rawRows
      .slice(startIdx)
      .map((row) => {
        const getVal = (col1Based: number) => {
          if (col1Based < 1) return '';
          const val = row[col1Based - 1];
          return val !== undefined && val !== null ? String(val).trim() : '';
        };
        const rawQty = getVal(mapping.quantityCol).replace(',', '.');
        const quantity = Number(rawQty) || 0;
        return {
          reducedCode: getVal(mapping.reducedCodeCol),
          name: getVal(mapping.nameCol),
          supplierCode: getVal(mapping.supplierCodeCol),
          barcode: getVal(mapping.barcodeCol),
          quantity,
        };
      })
      .filter((item) => item.name || item.barcode || item.reducedCode);
  }, [rawRows, skipHeader, mapping]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResultMsg(null);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: '',
    });
    setRawRows(rows);
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
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
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, 'modelo-estoque-validamerc.xlsx');
  };

  const handleConfirmImport = async () => {
    if (mappedItems.length === 0) return;
    setImporting(true);
    setResultMsg(null);
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: mappedItems }),
      });
      const data = await res.json();
      if (res.ok) {
        await onImported();
        setResultMsg({
          ok: true,
          text: `Importação concluída: ${data.inserted} novo(s) e ${data.updated} atualizado(s)${
            data.supabaseSynced ? ' (sincronizado com Supabase)' : ''
          }.`,
        });
      } else {
        setResultMsg({ ok: false, text: data.error || 'Erro ao importar planilha.' });
      }
    } catch {
      setResultMsg({ ok: false, text: 'Falha de conexão ao importar planilha.' });
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
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
                Informe o número da coluna (1, 2, 3...) correspondente a cada campo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* File Upload & Template */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {fileName ? `Arquivo: ${fileName}` : 'Selecione uma planilha .xlsx ou .xls'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {rawRows.length > 0
                  ? `${rawRows.length} linhas lidas · ${mappedItems.length} itens válidos`
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
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* 5 Column Number Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                Mapeamento das 5 Colunas (Número da Coluna na Planilha)
              </h4>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipHeader}
                  onChange={(e) => setSkipHeader(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Ignorar linha 1 (cabeçalho)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  1. Descrição do Produto / Nome *
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxCols + 20}
                  value={mapping.nameCol}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, nameCol: Number(e.target.value) || 1 }))
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  2. Código de Fornecedor
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxCols + 20}
                  value={mapping.supplierCodeCol}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      supplierCodeCol: Number(e.target.value) || 1,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  3. Código de Barras (EAN)
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxCols + 20}
                  value={mapping.barcodeCol}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, barcodeCol: Number(e.target.value) || 1 }))
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  4. Código Reduzido
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxCols + 20}
                  value={mapping.reducedCodeCol}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      reducedCodeCol: Number(e.target.value) || 1,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  5. Quantidade *
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxCols + 20}
                  value={mapping.quantityCol}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, quantityCol: Number(e.target.value) || 1 }))
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Preview Table */}
          {mappedItems.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pré-visualização (primeiros 5 itens)
                </span>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  Total: {mappedItems.length}
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

          {resultMsg && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                resultMsg.ok
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                  : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
              }`}
            >
              {resultMsg.ok && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              <span>{resultMsg.text}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[40px]"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || mappedItems.length === 0}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[40px]"
            >
              {importing
                ? 'Importando...'
                : `Importar ${mappedItems.length} Produto(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
