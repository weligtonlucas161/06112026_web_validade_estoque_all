import type { ExpirySeverity, ProductBatch } from '../types';

export function getDaysUntilExpiry(expirationDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(expirationDate + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getExpirySeverity(
  expirationDate: string,
  warningDays = 3
): ExpirySeverity {
  const days = getDaysUntilExpiry(expirationDate);
  if (days < 0) return 'vencido';
  if (days <= warningDays) return 'critico';
  if (days <= 7) return 'atencao';
  return 'em_dia';
}

export function formatExpiryLabel(expirationDate: string): string {
  const days = getDaysUntilExpiry(expirationDate);
  if (days < 0) {
    const abs = Math.abs(days);
    return abs === 1 ? 'Venceu ontem' : `Vencido há ${abs}d`;
  }
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  return `${days}d restantes`;
}

export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function exportProductsCSV(products: ProductBatch[]) {
  const headers = [
    'Código de Barras',
    'Produto',
    'Marca',
    'Categoria',
    'Localização',
    'Lote',
    'Quantidade',
    'Unidade',
    'Preço Unitário',
    'Validade',
    'Status Lote',
    'Presença Gôndola',
  ];

  const rows = products.map((p) => [
    p.barcode,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.brand.replace(/"/g, '""')}"`,
    p.category,
    `"${p.location.replace(/"/g, '""')}"`,
    p.batchCode,
    p.quantity,
    p.unit,
    p.unitPrice.toFixed(2),
    p.expirationDate,
    p.status,
    p.presenceStatus,
  ]);

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `validamerc-estoque-${new Date().toISOString().split('T')[0]}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
