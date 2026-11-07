import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { EstoqueItem, Loja, ProductBatch } from '../types';

interface StockViewProps {
  products: ProductBatch[];
  onQuickUpdate: (id: string, patch: Partial<ProductBatch>) => Promise<void>;
  onEditProduct: (product: ProductBatch) => void;
  onNewProduct: () => void;
  onRefresh: () => Promise<void>;
}

interface ImportColumnMapping {
  nameCol: number; // 1. Descrição do produto / nome
  supplierCodeCol: number; // 2. Código de fornecedor
  barcodeCol: number; // 3. Código de barras / EAN
  reducedCodeCol: number; // 4. Código reduzido
  quantityCol: number; // 5. Quantidade
}

interface EstoqueImportItem {
  id?: string;
  id_loja: string;
  produto: string;
  codigo_ean: string;
  codigo_reduzido: string;
  codigo_fornecedor: string;
  quantidade: number;
}

interface ImportApiResponse {
  ok: boolean;
  inserted: number;
  updated: number;
  total: number;
  supabaseSynced: boolean;
  supabaseMessage?: string;
}

function parseQuantityBR(raw: unknown): number {
  if (typeof raw === 'number') {
    return isNaN(raw) ? 0 : raw;
  }
  if (!raw) return 0;
  let str = String(raw).trim();
  str = str.replace(/[a-zA-Z]/g, '').trim();
  if (!str) return 0;

  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 2 && parts[1].length === 3 && Number(parts[0]) > 0) {
      str = parts[0] + parts[1];
    }
  }

  const num = Number(str);
  return isNaN(num) ? 0 : Math.round(num * 1000) / 1000;
}

function sanitizeBarcode(val: unknown): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (!str) return '';

  if (/^[0-9.]+[eE][+-]?[0-9]+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num) && Number.isFinite(num)) {
      str = BigInt(Math.round(num)).toString();
    }
  }

  str = str.replace(/\.0+$/, '');
  str = str.replace(/\s+/g, '');
  return str;
}

function sanitizeCode(val: unknown): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  str = str.replace(/\.0+$/, '');
  return str;
}

const MAX_ROWS_LIMIT = 5000;
const CHUNK_SIZE = 10; // Gravação estruturada em blocos de 10

function formatErrorMessage(err: unknown): string {
  if (!err) return 'Erro desconhecido.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.error === 'object' && obj.error !== null) {
      return formatErrorMessage(obj.error);
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Envia um bloco de 10 itens para /api/estoque/import
 * com validação estrita de JSON e extração segura de erros
 */
async function postEstoqueChunk(
  items: EstoqueImportItem[],
  idLoja: string
): Promise<ImportApiResponse> {
  let res: Response;
  try {
    res = await fetch('/api/estoque/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items, id_loja: idLoja }),
    });
  } catch (netErr) {
    throw new Error(`Falha de conexão com o servidor: ${formatErrorMessage(netErr)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();
  const trimmed = rawText.trim();

  const isLikelyJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!contentType.includes('application/json') && !isLikelyJson) {
    throw new Error(
      `O servidor retornou uma resposta inesperada (HTTP ${res.status}): ${trimmed.slice(0, 160)}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error(`Erro ao interpretar JSON retornado pelo servidor (HTTP ${res.status}).`);
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('A resposta recebida do servidor é inválida.');
  }

  const typed = data as Record<string, unknown>;
  if (!res.ok || typed.ok === false) {
    const msg = formatErrorMessage(typed.error) || `Erro de processamento no servidor (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  return {
    ok: true,
    inserted: Number(typed.inserted || 0),
    updated: Number(typed.updated || 0),
    total: Number(typed.total || 0),
    supabaseSynced: Boolean(typed.supabaseSynced),
    supabaseMessage: typeof typed.supabaseMessage === 'string' ? typed.supabaseMessage : undefined,
  };
}

export const StockView: React.FC<StockViewProps> = ({
  products,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('todas');
  const [estoqueList, setEstoqueList] = useState<EstoqueItem[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [lojas, setLojas] = useState<Loja[]>([]);

  // Modais
  const [importOpen, setImportOpen] = useState(false);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [sqlScriptType, setSqlScriptType] = useState<'master' | 'estoque'>('master');
  const [sqlCopied, setSqlCopied] = useState(false);
  const [editItemModal, setEditItemModal] = useState<EstoqueItem | null>(null);

  // Estados de upload da planilha
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [startRow, setStartRow] = useState<number>(2);
  const [endRow, setEndRow] = useState<number>(5001);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('loja-matriz-01');
  const [mapping, setMapping] = useState<ImportColumnMapping>({
    nameCol: 1, // Descrição do produto / nome
    supplierCodeCol: 2, // Código de fornecedor
    barcodeCol: 3, // Código de barras / EAN
    reducedCodeCol: 4, // Código reduzido
    quantityCol: 5, // Quantidade
  });

  // Tela de Gravação em Tempo Real (Item a Item, em blocos de 10)
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingIndex, setRecordingIndex] = useState(0);
  const [recordingTotal, setRecordingTotal] = useState(0);
  const [recordingBlock, setRecordingBlock] = useState(0);
  const [recordingTotalBlocks, setRecordingTotalBlocks] = useState(0);
  const [recordingCurrentItem, setRecordingCurrentItem] = useState<EstoqueImportItem | null>(null);
  const [recordingHistory, setRecordingHistory] = useState<
    Array<{ id: string; produto: string; codigo_ean: string; quantidade: number; time: string }>
  >([]);
  const [recordingStats, setRecordingStats] = useState<{
    inserted: number;
    updated: number;
    supabaseSynced: boolean;
    supabaseMessage?: string;
  } | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingComplete, setRecordingComplete] = useState(false);

  // Carrega lojas cadastradas
  const fetchLojas = async () => {
    try {
      const res = await fetch('/api/lojas');
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.lojas)) {
          setLojas(json.lojas);
          if (json.lojas.length > 0) {
            setSelectedStoreId(json.lojas[0].id);
          }
        }
      }
    } catch {
      // Offline fallback
    }
  };

  // Carrega itens da tabela separada de estoque do backend
  const fetchEstoque = async () => {
    try {
      setLoadingEstoque(true);
      const res = await fetch('/api/estoque');
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.items)) {
          setEstoqueList(json.items);
          return;
        }
      }
      // Fallback a partir de products se o endpoint ainda não tiver dados
      const fallback = products.map((p, idx) => ({
        id: p.id,
        id_loja: 'loja-matriz-01',
        produto: p.name,
        codigo_ean: p.barcode || '',
        codigo_reduzido: p.reducedCode || String(1001 + idx),
        codigo_fornecedor: p.supplierCode || 'FORN-01',
        quantidade: p.quantity,
        atualizado_em: p.createdAt,
      }));
      setEstoqueList(fallback);
    } catch {
      // Offline fallback
      const fallback = products.map((p, idx) => ({
        id: p.id,
        id_loja: 'loja-matriz-01',
        produto: p.name,
        codigo_ean: p.barcode || '',
        codigo_reduzido: p.reducedCode || String(1001 + idx),
        codigo_fornecedor: p.supplierCode || 'FORN-01',
        quantidade: p.quantity,
        atualizado_em: p.createdAt,
      }));
      setEstoqueList(fallback);
    } finally {
      setLoadingEstoque(false);
    }
  };

  useEffect(() => {
    fetchLojas();
    fetchEstoque();
  }, [products]);

  // Lojas únicas presentes no estoque
  const uniqueStores = useMemo(() => {
    const set = new Set<string>();
    estoqueList.forEach((e) => {
      if (e.id_loja) set.add(e.id_loja);
    });
    return Array.from(set);
  }, [estoqueList]);

  // Filtro de pesquisa e loja
  const filteredEstoque = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return estoqueList.filter((item) => {
      if (storeFilter !== 'todas' && item.id_loja !== storeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.produto.toLowerCase().includes(q) ||
        (item.codigo_ean && item.codigo_ean.toLowerCase().includes(q)) ||
        (item.codigo_reduzido && item.codigo_reduzido.toLowerCase().includes(q)) ||
        (item.codigo_fornecedor && item.codigo_fornecedor.toLowerCase().includes(q)) ||
        item.id_loja.toLowerCase().includes(q)
      );
    });
  }, [estoqueList, searchQuery, storeFilter]);

  // Métricas de estoque
  const totalItemsCount = estoqueList.length;
  const totalVolume = useMemo(
    () => estoqueList.reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0),
    [estoqueList]
  );
  const zeroQuantityCount = useMemo(
    () => estoqueList.filter((i) => Number(i.quantidade) <= 0).length,
    [estoqueList]
  );

  // Intervalo de linhas da planilha
  const selectedRowsCount = Math.max(0, endRow - startRow + 1);
  const exceedsMaxRows = selectedRowsCount > MAX_ROWS_LIMIT;

  // Itens mapeados da planilha com sanitização completa de dados
  const mappedItemsWithRowNumber = useMemo(() => {
    if (exceedsMaxRows || startRow < 1 || endRow < startRow || rawRows.length === 0) {
      return [];
    }

    const startIdx = Math.max(0, startRow - 1);
    const endIdx = Math.min(rawRows.length, endRow);

    const items: Array<EstoqueImportItem & { originalRow: number }> = [];

    for (let i = startIdx; i < endIdx; i++) {
      const row = rawRows[i];
      if (!row || !Array.isArray(row)) continue;

      const getCell = (col1Based: number): string => {
        if (col1Based < 1) return '';
        const val = row[col1Based - 1];
        return val !== undefined && val !== null ? String(val).trim() : '';
      };

      const produto = getCell(mapping.nameCol);
      const codigo_fornecedor = sanitizeCode(getCell(mapping.supplierCodeCol));
      const codigo_ean = sanitizeBarcode(getCell(mapping.barcodeCol));
      const codigo_reduzido = sanitizeCode(getCell(mapping.reducedCodeCol));
      const quantidade = parseQuantityBR(getCell(mapping.quantityCol));

      if (produto || codigo_ean || codigo_reduzido) {
        items.push({
          id_loja: selectedStoreId || 'loja-matriz-01',
          produto,
          codigo_fornecedor,
          codigo_ean,
          codigo_reduzido,
          quantidade,
          originalRow: i + 1,
        });
      }
    }

    return items;
  }, [rawRows, startRow, endRow, exceedsMaxRows, mapping, selectedStoreId]);

  const mappedItems = useMemo(
    () => mappedItemsWithRowNumber.map(({ originalRow, ...rest }) => rest),
    [mappedItemsWithRowNumber]
  );

  // Primeiras 5 linhas para a pré-visualização em tempo real
  const previewItems = useMemo(() => {
    return mappedItemsWithRowNumber.slice(0, 5);
  }, [mappedItemsWithRowNumber]);

  // Leitura da planilha .xlsx / .xls / .csv com auto-detecção de cabeçalhos
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
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

      if (!rows || rows.length === 0) {
        alert('A planilha selecionada está vazia ou não contém dados legíveis.');
        return;
      }

      setRawRows(rows);

      // Detecção inteligente de colunas a partir da linha de cabeçalho (rows[0])
      const headerRow = rows[0] || [];
      let detectedName = 0;
      let detectedSupplier = 0;
      let detectedBarcode = 0;
      let detectedReduced = 0;
      let detectedQty = 0;

      headerRow.forEach((colName, idx) => {
        const col = String(colName || '').toLowerCase().trim();
        const colNum = idx + 1;

        if (
          !detectedName &&
          (col.includes('descri') ||
            col.includes('produto') ||
            col.includes('nome') ||
            col.includes('item') ||
            col.includes('mercadoria'))
        ) {
          detectedName = colNum;
        } else if (
          !detectedBarcode &&
          (col.includes('ean') ||
            col.includes('barra') ||
            col.includes('gtin') ||
            col.includes('cód. barras'))
        ) {
          detectedBarcode = colNum;
        } else if (
          !detectedReduced &&
          (col.includes('reduzid') ||
            col.includes('plu') ||
            col.includes('interno') ||
            col.includes('cód. red'))
        ) {
          detectedReduced = colNum;
        } else if (
          !detectedSupplier &&
          (col.includes('fornec') ||
            col.includes('supplier') ||
            col.includes('cód. forn'))
        ) {
          detectedSupplier = colNum;
        } else if (
          !detectedQty &&
          (col.includes('quant') ||
            col.includes('qtd') ||
            col.includes('saldo') ||
            col.includes('estoque') ||
            col.includes('fisic') ||
            col.includes('físic') ||
            col.includes('unidades'))
        ) {
          detectedQty = colNum;
        }
      });

      // Se detectou pelo menos 1 coluna chave, aplica o mapeamento inteligente
      if (detectedName || detectedBarcode || detectedQty) {
        setMapping({
          nameCol: detectedName || 1,
          supplierCodeCol: detectedSupplier || 0,
          barcodeCol: detectedBarcode || 0,
          reducedCodeCol: detectedReduced || 0,
          quantityCol: detectedQty || (rows[0].length >= 5 ? 5 : 0),
        });
        setStartRow(2); // Pula linha de cabeçalho
      } else {
        // Padrão sequencial 1 a 5
        setStartRow(rows.length > 1 ? 2 : 1);
      }

      setEndRow(Math.min(rows.length, 5001));
    } catch (err) {
      alert(`Falha ao ler o arquivo Excel: ${formatErrorMessage(err)}`);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      [
        'Descrição do Produto',
        'Código do Fornecedor',
        'Código de Barras (EAN)',
        'Código Reduzido',
        'Quantidade',
      ],
      ['Arroz Branco Tipo 1 5kg', 'FORN-101', '7896006700012', '1001', 50],
      ['Feijão Carioca 1kg', 'FORN-101', '7896006700029', '1002', 80],
      ['Óleo de Soja 900ml', 'FORN-204', '7891107000123', '1003', 45],
      ['Leite UHT Integral 1L', 'FORN-301', '7891000315507', '1004', 120],
      ['Café Torrado 500g', 'FORN-402', '7896089012017', '1005', 30],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, 'modelo-estoque-separado.xlsx');
  };

  // Iniciar gravação em blocos de 10 com visualização item a item
  const handleStartRecording = async () => {
    if (mappedItems.length === 0) {
      alert('Nenhum item válido foi encontrado no intervalo especificado.');
      return;
    }

    setImportOpen(false);
    setRecordingActive(true);
    setRecordingComplete(false);
    setRecordingError(null);
    setRecordingHistory([]);
    setRecordingTotal(mappedItems.length);
    setRecordingIndex(0);

    const totalBlocks = Math.ceil(mappedItems.length / CHUNK_SIZE);
    setRecordingTotalBlocks(totalBlocks);

    let totalInserted = 0;
    let totalUpdated = 0;
    let anySupabaseSynced = false;
    let lastSupabaseMsg = '';

    try {
      for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
        const start = blockIdx * CHUNK_SIZE;
        const chunk = mappedItems.slice(start, start + CHUNK_SIZE);
        setRecordingBlock(blockIdx + 1);

        // Visualização item por item na tela com ritmo fluido
        for (let j = 0; j < chunk.length; j++) {
          const item = chunk[j];
          const currentItemNumber = start + j + 1;

          setRecordingIndex(currentItemNumber);
          setRecordingCurrentItem(item);

          // Pequena pausa visual para o usuário acompanhar a gravação de cada item
          await new Promise((resolve) => setTimeout(resolve, 40));

          setRecordingHistory((prev) => [
            {
              id: `${currentItemNumber}-${Date.now()}`,
              produto: item.produto,
              codigo_ean: item.codigo_ean || item.codigo_reduzido || 'Sem EAN',
              quantidade: item.quantidade,
              time: new Date().toLocaleTimeString('pt-BR'),
            },
            ...prev.slice(0, 14), // Mantém os últimos 15 no feed visual
          ]);
        }

        // Grava o bloco de 10 no backend e sincroniza com o banco
        const result = await postEstoqueChunk(chunk, selectedStoreId);
        totalInserted += result.inserted;
        totalUpdated += result.updated;
        if (result.supabaseSynced) anySupabaseSynced = true;
        if (result.supabaseMessage) lastSupabaseMsg = result.supabaseMessage;
      }

      setRecordingStats({
        inserted: totalInserted,
        updated: totalUpdated,
        supabaseSynced: anySupabaseSynced,
        supabaseMessage: lastSupabaseMsg,
      });
      setRecordingComplete(true);

      // Atualiza o estoque local e sincroniza
      await fetchEstoque();
      await onRefresh();
    } catch (err) {
      const msg = formatErrorMessage(err);
      setRecordingError(msg);
    }
  };

  // Ajuste rápido de quantidade (+1 / -1)
  const handleQuickQtyChange = async (item: EstoqueItem, delta: number) => {
    const newQty = Math.max(0, Number(item.quantidade) + delta);
    try {
      const res = await fetch('/api/estoque', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          quantidade: newQty,
        }),
      });
      if (res.ok) {
        setEstoqueList((prev) =>
          prev.map((e) => (e.id === item.id ? { ...e, quantidade: newQty } : e))
        );
      }
    } catch (err) {
      console.error('Erro ao atualizar quantidade:', err);
    }
  };

  // Exclusão de item de estoque
  const handleDeleteItem = async (id: string) => {
    if (!confirm('Deseja realmente remover este item do estoque?')) return;
    try {
      const res = await fetch(`/api/estoque/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setEstoqueList((prev) => prev.filter((e) => e.id !== id));
      }
    } catch (err) {
      alert(`Falha ao excluir item: ${formatErrorMessage(err)}`);
    }
  };

  // Salvar edição manual de item
  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItemModal) return;

    try {
      const res = await fetch('/api/estoque', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editItemModal),
      });
      if (res.ok) {
        setEditItemModal(null);
        await fetchEstoque();
        await onRefresh();
      } else {
        const data = await res.json();
        alert(`Erro ao salvar: ${data.error || 'Falha no servidor'}`);
      }
    } catch (err) {
      alert(`Erro: ${formatErrorMessage(err)}`);
    }
  };

  const masterSql = `-- ============================================================================
-- SCRIPT MASTER CONSOLIDADO: EXECUTAR TUDO (PRODUÇÃO)
-- Sistema: Synk / ValidaMerc - Controle de Prevenção de Perdas
-- Versão: 2026.1 (Multi-tenant, Matriz/Filiais, Sessão Única, RLS e Auditoria)
-- ============================================================================

-- 1. LOJAS (Multi-tenancy e Filiais)
CREATE TABLE IF NOT EXISTS public.lojas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome_loja TEXT NOT NULL,
    cor_borda TEXT NOT NULL DEFAULT '#059669',
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    matriz_id TEXT REFERENCES public.lojas(id) ON DELETE SET NULL,
    matrix_uuid TEXT,
    limite_lojas INTEGER NOT NULL DEFAULT 100,
    limite_usuarios_por_loja INTEGER NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USUÁRIOS
CREATE TABLE IF NOT EXISTS public.usuarios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    matricula TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    cargo TEXT NOT NULL DEFAULT 'operador',
    setor TEXT,
    loja_id TEXT REFERENCES public.lojas(id) ON DELETE SET NULL,
    senha_hash TEXT,
    email TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PRODUTOS (Isolamento por Loja / Estoque)
CREATE TABLE IF NOT EXISTS public.produtos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome TEXT NOT NULL,
    codigo_barras TEXT NOT NULL,
    plu TEXT,
    setor TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 0,
    data_vencimento TEXT NOT NULL,
    loja_id TEXT NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    criado_em BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produtos_loja_id ON public.produtos(loja_id);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON public.produtos(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_produtos_ean_loja ON public.produtos(loja_id, codigo_barras);

-- 4. CATÁLOGO UNIVERSAL DE PRODUTOS (Base Global)
CREATE TABLE IF NOT EXISTS public.produtos_catalogo_universal (
    codigo_barras TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_universal_nome ON public.produtos_catalogo_universal(nome);

-- 5. TABELA DE ESTOQUE (Compatibilidade)
CREATE TABLE IF NOT EXISTS public.estoque (
    id TEXT PRIMARY KEY,
    id_loja TEXT NOT NULL DEFAULT 'loja-matriz-01',
    produto TEXT NOT NULL,
    codigo_ean TEXT DEFAULT '',
    codigo_reduzido TEXT DEFAULT '',
    codigo_fornecedor TEXT DEFAULT '',
    quantidade NUMERIC(12, 3) NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS e Permissões
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_catalogo_universal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso seguro lojas" ON public.lojas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso seguro usuarios" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso seguro produtos" ON public.produtos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso seguro catalogo" ON public.produtos_catalogo_universal FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso seguro estoque" ON public.estoque FOR ALL USING (true) WITH CHECK (true);`;

  const copySqlScript = (type: 'master' | 'estoque' = sqlScriptType) => {
    const textToCopy = type === 'master' ? masterSql : `-- Tabela Separada: ESTOQUE
CREATE TABLE IF NOT EXISTS public.estoque (
  id TEXT PRIMARY KEY,
  id_loja TEXT NOT NULL DEFAULT 'loja-matriz-01',
  produto TEXT NOT NULL,
  codigo_ean TEXT DEFAULT '',
  codigo_reduzido TEXT DEFAULT '',
  codigo_fornecedor TEXT DEFAULT '',
  quantidade NUMERIC(12, 3) NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estoque_id_loja ON public.estoque (id_loja);
CREATE INDEX IF NOT EXISTS idx_estoque_codigo_ean ON public.estoque (codigo_ean);
CREATE INDEX IF NOT EXISTS idx_estoque_codigo_reduzido ON public.estoque (codigo_reduzido);
CREATE INDEX IF NOT EXISTS idx_estoque_codigo_fornecedor ON public.estoque (codigo_fornecedor);
CREATE INDEX IF NOT EXISTS idx_estoque_produto ON public.estoque (produto);

ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso seguro estoque" ON public.estoque FOR ALL USING (true) WITH CHECK (true);`;

    navigator.clipboard.writeText(textToCopy);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total de Itens Cadastrados
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {totalItemsCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Estrutura de banco separada (tabela estoque)
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Volume Físico Total
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {totalVolume}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Unidades somadas em estoque
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Estoque Zerado / Ruptura
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono text-red-600 dark:text-red-400 tabular-nums">
            {zeroQuantityCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Necessitam reposição imediata
          </p>
        </div>
      </div>

      {/* Toolbar: Busca + Filtro Loja + Importar .xlsx + Script SQL */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por produto, EAN, cód. reduzido ou fornecedor..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {uniqueStores.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Store className="w-4 h-4 text-slate-400" />
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="todas">Todas as Lojas</option>
                {uniqueStores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSqlModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[40px]"
          >
            <Database className="w-4 h-4 text-sky-600" />
            <span>Script SQL Supabase</span>
          </button>

          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors min-h-[40px]"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Importar Planilha (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditItemModal({
                id: `est-${Date.now()}`,
                id_loja: selectedStoreId || 'loja-1',
                produto: '',
                codigo_ean: '',
                codigo_reduzido: '',
                codigo_fornecedor: '',
                quantidade: 1,
              });
            }}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-700 transition-colors min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Item</span>
          </button>
        </div>
      </div>

      {/* Tabela de Estoque Separada */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        {filteredEstoque.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Boxes className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Nenhum item encontrado no estoque
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Importe uma planilha Excel (.xlsx) com até 5.000 linhas ou adicione itens manualmente.
            </p>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Importar Planilha</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Loja</th>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Código EAN</th>
                  <th className="py-3 px-4">Cód. Reduzido</th>
                  <th className="py-3 px-4">Cód. Fornecedor</th>
                  <th className="py-3 px-4 text-right">Quantidade</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEstoque.map((item) => {
                  const isZero = Number(item.quantidade) <= 0;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-500">
                        <span className="inline-block rounded-sm bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px]">
                          {item.id_loja || 'loja-1'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.produto}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {item.codigo_ean ? (
                          <span className="tabular-nums">{item.codigo_ean}</span>
                        ) : (
                          <span className="text-slate-400 italic">Sem código</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {item.codigo_reduzido || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {item.codigo_fornecedor || '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                          <button
                            type="button"
                            onClick={() => handleQuickQtyChange(item, -1)}
                            className="p-1 rounded-sm text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Diminuir 1"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span
                            className={`min-w-[40px] text-center font-bold ${
                              isZero
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {item.quantidade}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuickQtyChange(item, 1)}
                            className="p-1 rounded-sm text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Aumentar 1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditItemModal(item)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Editar item"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Excluir item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL DE IMPORTAÇÃO DE PLANILHA (.XLSX) COM MAPEAMENTO DE COLUNAS
         ========================================================================= */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Importação de Planilha de Estoque (.xlsx)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gravação em blocos de 10 com visualização de gravação item a item
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Upload Area */}
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl p-5 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-950/40"
              >
                <Upload className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {fileName ? fileName : 'Clique para selecionar a planilha (.xlsx, .xls ou .csv)'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Suporta arquivos de até 5.000 linhas por lote de importação
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileSelected}
                  className="hidden"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Planilha Modelo (.xlsx)</span>
                </button>
                {rawRows.length > 0 && (
                  <span className="text-slate-500 font-mono">
                    Total na planilha: {rawRows.length} linhas
                  </span>
                )}
              </div>
            </div>

            {/* Configuração de Intervalo e Loja */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Linha Inicial:
                </label>
                <input
                  type="number"
                  min={1}
                  value={startRow}
                  onChange={(e) => setStartRow(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-400">Normalmente 2 (pula cabeçalho)</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Linha Final:
                </label>
                <input
                  type="number"
                  min={startRow}
                  value={endRow}
                  onChange={(e) => setEndRow(Math.max(startRow, Number(e.target.value) || startRow))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-400">Até 5.000 linhas por importação</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Loja de Destino:
                </label>
                {lojas.length > 0 ? (
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                  >
                    {lojas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome_loja} ({l.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    placeholder="loja-matriz-01"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                  />
                )}
                <span className="text-[10px] text-slate-400">Tabela lojas / coluna loja_id</span>
              </div>
            </div>

            {/* Mapeamento das 5 Colunas (permite 0 se não possuir) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 dark:text-white">
                  Mapeamento das 5 Colunas da Planilha (Informe 0 caso não possua):
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    1. Descrição / Nome:
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={mapping.nameCol}
                    onChange={(e) =>
                      setMapping({ ...mapping, nameCol: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Coluna na planilha</span>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    2. Cód. Fornecedor:
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={mapping.supplierCodeCol}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        supplierCodeCol: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">0 se não possuir</span>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    3. Código de Barras (EAN):
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={mapping.barcodeCol}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        barcodeCol: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">0 se não possuir</span>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    4. Código Reduzido:
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={mapping.reducedCodeCol}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        reducedCodeCol: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">0 se não possuir</span>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 sm:col-span-2 md:col-span-2">
                  <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    5. Quantidade em Estoque:
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={mapping.quantityCol}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        quantityCol: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Coluna de estoque físico</span>
                </div>
              </div>
            </div>

            {/* Aviso de teto de 5.000 linhas */}
            {exceedsMaxRows && (
              <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Limite de 5.000 linhas excedido ({selectedRowsCount} selecionadas)</p>
                  <p className="mt-0.5">
                    Para garantir estabilidade e evitar travamento do navegador, ajuste a Linha Final para no máximo {startRow + MAX_ROWS_LIMIT - 1}.
                  </p>
                </div>
              </div>
            )}

            {/* Pré-visualização da Extração dos Dados (Primeiras 5 Linhas) */}
            {rawRows.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Pré-visualização da Extração (Primeiras {previewItems.length} linhas do intervalo)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Formatação BR e EAN sanitizado
                  </span>
                </div>

                {previewItems.length === 0 ? (
                  <div className="p-3 text-center text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    Nenhum dado legível foi identificado com o mapeamento atual nas linhas {startRow} a {endRow}.
                    Verifique se o número das colunas corresponde à planilha.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/75 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                          <th className="py-1.5 px-2.5">Linha</th>
                          <th className="py-1.5 px-2.5">Produto / Descrição</th>
                          <th className="py-1.5 px-2.5">EAN</th>
                          <th className="py-1.5 px-2.5">Reduzido</th>
                          <th className="py-1.5 px-2.5">Fornecedor</th>
                          <th className="py-1.5 px-2.5 text-right">Qtd</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {previewItems.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-1.5 px-2.5 text-slate-400">#{p.originalRow}</td>
                            <td className="py-1.5 px-2.5 font-medium font-sans text-slate-900 dark:text-white truncate max-w-[180px]">
                              {p.produto || <span className="text-slate-400 italic">Vazio</span>}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-300">
                              {p.codigo_ean || '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-300">
                              {p.codigo_reduzido || '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-300">
                              {p.codigo_fornecedor || '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {p.quantidade} un
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Resumo da importação mapeada */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {mappedItems.length} itens válidos
                </span>{' '}
                <span className="text-slate-500">
                  (serão quebrados em blocos de 10 para gravação)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleStartRecording}
                  disabled={mappedItems.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
                >
                  <Database className="w-4 h-4" />
                  <span>Gravar no Estoque (Blocos de 10)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TELA DE GRAVAÇÃO EM TEMPO REAL: ITEM A ITEM (BLOCOS DE 10)
         ========================================================================= */}
      {recordingActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-5 my-8">
            {/* Cabeçalho de gravação */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 animate-pulse">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {recordingComplete ? 'Gravação Concluída!' : 'Gravando Dados no Estoque'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Processamento em blocos de 10 com gravação item a item
                  </p>
                </div>
              </div>

              {recordingComplete && (
                <button
                  type="button"
                  onClick={() => setRecordingActive(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Barra de Progresso */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Item {recordingIndex} de {recordingTotal}
                </span>
                <span className="text-slate-500">
                  Bloco {recordingBlock} de {recordingTotalBlocks} (10 por bloco)
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {recordingTotal > 0
                    ? Math.round((recordingIndex / recordingTotal) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-75 rounded-full"
                  style={{
                    width: `${
                      recordingTotal > 0
                        ? Math.min(100, Math.round((recordingIndex / recordingTotal) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Destaque do Item Sendo Gravado Agora */}
            {!recordingComplete && recordingCurrentItem && (
              <div className="p-4 rounded-xl border-2 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Gravando no banco agora...</span>
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    Loja: {recordingCurrentItem.id_loja}
                  </span>
                </div>

                <div className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {recordingCurrentItem.produto || 'Produto sem descrição'}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="block text-slate-400 text-[10px]">EAN:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block">
                      {recordingCurrentItem.codigo_ean || '0'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="block text-slate-400 text-[10px]">Reduzido:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block">
                      {recordingCurrentItem.codigo_reduzido || '0'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="block text-slate-400 text-[10px]">Fornecedor:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block">
                      {recordingCurrentItem.codigo_fornecedor || '0'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="block text-slate-400 text-[10px]">Quantidade:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                      {recordingCurrentItem.quantidade} un
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Feed dos Últimos Itens Gravados */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Últimos Itens Gravados no Banco:
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
                {recordingHistory.map((h) => (
                  <div
                    key={h.id}
                    className="pt-1 flex items-center justify-between text-xs py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {h.produto}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        ({h.codigo_ean})
                      </span>
                    </div>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      +{h.quantidade} un
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mensagem de Erro (se houver) */}
            {recordingError && (
              <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Ocorreu um erro na gravação do bloco:</p>
                  <p className="mt-0.5">{recordingError}</p>
                </div>
              </div>
            )}

            {/* Sucesso e Ações Finais */}
            {recordingComplete && recordingStats && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Todos os dados foram gravados com sucesso!</span>
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  {recordingStats.inserted} novos registros adicionados e {recordingStats.updated}{' '}
                  atualizados na tabela de estoque.
                </p>
                {recordingStats.supabaseSynced ? (
                  <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    ✓ Sincronizado com tabela estoque no Supabase.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Dados salvos com segurança no banco local.
                    {recordingStats.supabaseMessage && ` (${recordingStats.supabaseMessage})`}
                  </p>
                )}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setRecordingActive(false)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    Concluir e Ver Estoque
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL SCRIPT SQL SUPABASE (Para criar a estrutura separada de estoque)
         ========================================================================= */}
      {sqlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Estrutura de Banco de Dados Separada: ESTOQUE
                  </h3>
                  <p className="text-xs text-slate-500">
                    Código SQL oficial para executar no Supabase SQL Editor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSqlModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Selecione o script SQL correspondente, copie e execute no <strong>SQL Editor</strong> do seu projeto Supabase:
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSqlScriptType('master')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    sqlScriptType === 'master'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Script Master Completo (2026)
                </button>
                <button
                  type="button"
                  onClick={() => setSqlScriptType('estoque')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    sqlScriptType === 'estoque'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Tabela Estoque
                </button>
              </div>

              <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-72">
                <pre>{sqlScriptType === 'master' ? masterSql : `-- Tabela Separada: ESTOQUE
CREATE TABLE IF NOT EXISTS public.estoque (
  id TEXT PRIMARY KEY,
  id_loja TEXT NOT NULL DEFAULT 'loja-matriz-01',
  produto TEXT NOT NULL,
  codigo_ean TEXT DEFAULT '',
  codigo_reduzido TEXT DEFAULT '',
  codigo_fornecedor TEXT DEFAULT '',
  quantidade NUMERIC(12, 3) NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estoque_id_loja ON public.estoque (id_loja);
CREATE INDEX IF NOT EXISTS idx_estoque_codigo_ean ON public.estoque (codigo_ean);
CREATE INDEX IF NOT EXISTS idx_estoque_codigo_reduzido ON public.estoque (codigo_reduzido);
CREATE INDEX IF NOT EXISTS idx_estoque_codigo_fornecedor ON public.estoque (codigo_fornecedor);
CREATE INDEX IF NOT EXISTS idx_estoque_produto ON public.estoque (produto);

ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso seguro estoque" ON public.estoque FOR ALL USING (true) WITH CHECK (true);`}</pre>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                {sqlScriptType === 'master'
                  ? 'Inclui: lojas, usuarios, produtos, auditoria e catalogo universal'
                  : 'Colunas: id, id_loja, produto, codigo_ean, codigo_reduzido, codigo_fornecedor, quantidade'}
              </span>
              <button
                type="button"
                onClick={() => copySqlScript(sqlScriptType)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm transition-colors"
              >
                {sqlCopied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Copiado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar {sqlScriptType === 'master' ? 'Script Master' : 'SQL Estoque'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE EDIÇÃO / CRIAÇÃO MANUAL DE ITEM DE ESTOQUE
         ========================================================================= */}
      {editItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditItem}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editItemModal.produto ? 'Editar Item de Estoque' : 'Novo Item de Estoque'}
              </h3>
              <button
                type="button"
                onClick={() => setEditItemModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição do Produto / Nome:
                </label>
                <input
                  type="text"
                  required
                  value={editItemModal.produto}
                  onChange={(e) =>
                    setEditItemModal({ ...editItemModal, produto: e.target.value })
                  }
                  placeholder="Ex: Leite Integral UHT 1L"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Código de Barras (EAN):
                  </label>
                  <input
                    type="text"
                    value={editItemModal.codigo_ean}
                    onChange={(e) =>
                      setEditItemModal({ ...editItemModal, codigo_ean: e.target.value })
                    }
                    placeholder="7891000315507"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Código Reduzido:
                  </label>
                  <input
                    type="text"
                    value={editItemModal.codigo_reduzido}
                    onChange={(e) =>
                      setEditItemModal({ ...editItemModal, codigo_reduzido: e.target.value })
                    }
                    placeholder="1001"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cód. Fornecedor:
                  </label>
                  <input
                    type="text"
                    value={editItemModal.codigo_fornecedor}
                    onChange={(e) =>
                      setEditItemModal({ ...editItemModal, codigo_fornecedor: e.target.value })
                    }
                    placeholder="FORN-01"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quantidade:
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editItemModal.quantidade}
                    onChange={(e) =>
                      setEditItemModal({
                        ...editItemModal,
                        quantidade: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ID da Loja:
                  </label>
                  <input
                    type="text"
                    value={editItemModal.id_loja}
                    onChange={(e) =>
                      setEditItemModal({ ...editItemModal, id_loja: e.target.value })
                    }
                    placeholder="loja-1"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditItemModal(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                Salvar Item
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
