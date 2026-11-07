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
 * Estrutura separada do Banco de Dados: ESTOQUE
 * Colunas: id, id_loja, produto, codigo_ean, codigo_reduzido, codigo_fornecedor, quantidade
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
  reducedCode?: string; // Código Reduzido (ex: 1042)
  barcode: string; // Código de Barras (EAN)
  name: string; // Descrição do Produto / Nome
  brand: string;
  category: ProductCategory;
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

