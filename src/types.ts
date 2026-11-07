export type ProductCategory =
  | 'Laticínios'
  | 'Padaria'
  | 'Açougue'
  | 'Hortifrúti'
  | 'Bebidas'
  | 'Mercearia'
  | 'Congelados'
  | 'Higiene';

export type ProductUnit = 'un' | 'kg' | 'cx' | 'L';

export type BatchStatus = 'ativo' | 'promocao' | 'descartado';

export type PresenceStatus = 'presente' | 'ruptura' | 'reposicao';

export type ExpirySeverity = 'vencido' | 'critico' | 'atencao' | 'em_dia';

/**
 * Tabela LOJAS (Multi-Tenancy, Matriz e Filiais)
 */
export interface Loja {
  id: string;
  nome_loja: string;
  cor_borda: string;
  ativa: boolean;
  matriz_id?: string | null;
  matrix_uuid?: string | null;
  limite_lojas?: number;
  limite_usuarios_por_loja?: number;
  cnpj?: string;
  endereco?: string;
  telefone?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Tabela PRODUTOS (Isolamento por Loja / Estoque)
 */
export interface Produto {
  id: string;
  nome: string;
  codigo_barras: string;
  plu?: string | null; // Código reduzido / interno
  setor: string;
  quantidade: number;
  data_vencimento: string; // YYYY-MM-DD
  loja_id: string;
  criado_em?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Tabela PRODUTOS_CATALOGO_UNIVERSAL (Base Global Compartilhada)
 */
export interface CatalogoUniversalItem {
  codigo_barras: string;
  nome: string;
  criado_em?: string;
  atualizado_em?: string;
}

/**
 * Tabela USUARIOS
 */
export interface Usuario {
  id: string;
  matricula: string;
  nome: string;
  cargo: 'adm' | 'master' | 'operador';
  setor?: string | null;
  loja_id?: string | null;
  email?: string | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Estrutura de ESTOQUE
 */
export interface EstoqueItem {
  id: string;
  id_loja: string;
  produto: string;
  codigo_ean: string;
  codigo_reduzido: string;
  codigo_fornecedor: string;
  quantidade: number;
  atualizado_em?: string;
  criado_em?: string;
}

export interface ProductBatch {
  id: string;
  reducedCode?: string; // Código Reduzido / PLU (ex: 1042)
  plu?: string; // Sinônimo para banco de dados
  barcode: string; // Código de Barras (EAN)
  name: string; // Descrição do Produto / Nome
  brand: string;
  category: ProductCategory;
  setor?: string; // Setor no novo banco
  location: string;
  supplier: string;
  supplierCode?: string; // Código de Fornecedor
  batchCode: string;
  quantity: number;
  unit: ProductUnit;
  unitPrice: number;
  expirationDate: string; // YYYY-MM-DD
  status: BatchStatus;
  presenceStatus: PresenceStatus;
  loja_id?: string; // Isolamento por loja
  lastAuditedAt?: string;
  createdAt: string;
}

export type AuditType = 'presenca' | 'validade' | 'inventario';

export interface AuditItemRecord {
  productId: string;
  barcode: string;
  productName: string;
  expectedQty: number;
  countedQty?: number;
  expectedExpiry: string;
  verifiedExpiry?: string;
  presence?: PresenceStatus;
  divergence: boolean;
  notes?: string;
}

export interface AuditSession {
  id: string;
  type: AuditType;
  auditorName: string;
  sector: string;
  createdAt: string;
  totalItems: number;
  divergencesCount: number;
  items: AuditItemRecord[];
}

export interface PushSettings {
  enabled: boolean;
  daysBeforeExpiry: number;
  autoCheckMinutes: number;
  includeExpired: boolean;
  lastCheckedAt?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  severity: 'critical' | 'warning' | 'info';
  productId?: string;
  barcode?: string;
  createdAt: string;
  read: boolean;
}

export interface BarcodeScanResult {
  barcode: string;
  productName?: string;
  brand?: string;
  expirationDate?: string;
  batchCode?: string;
  engine: 'Google ML Kit (BarcodeDetector)' | 'Google Gemini Vision' | 'Entrada Manual';
  matchedProduct?: ProductBatch | null;
}

export interface IntegrationStatusResponse {
  supabase: {
    configured: boolean;
    urlHost: string;
    keyHint: string;
    source: 'env' | 'vault' | 'none';
    updatedAt?: string;
  };
  vercel: {
    configured: boolean;
    projectId: string;
    teamId: string;
    tokenHint: string;
    source: 'env' | 'vault' | 'none';
    updatedAt?: string;
  };
}

