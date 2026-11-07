import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import * as webpush from 'web-push';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  AppNotification,
  AuditSession,
  CatalogoUniversalItem,
  EstoqueItem,
  Loja,
  ProductBatch,
  Produto,
  PushSettings,
  Usuario,
} from './src/types';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

interface StoreData {
  lojas: Loja[];
  produtos: Produto[];
  catalogo_universal: CatalogoUniversalItem[];
  usuarios: Usuario[];
  products: ProductBatch[];
  estoque: EstoqueItem[];
  audits: AuditSession[];
  notifications: AppNotification[];
  pushSettings: PushSettings;
  vapidKeys: {
    publicKey: string;
    privateKey: string;
  };
  subscriptions: webpush.PushSubscription[];
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function createInitialStore(): StoreData {
  const vapidKeys = webpush.generateVAPIDKeys();
  const now = new Date().toISOString();

  const products: ProductBatch[] = [
    {
      id: 'prod-1',
      barcode: '7891000315507',
      name: 'Leite Integral UHT 1L',
      brand: 'Piracanjuba',
      category: 'Laticínios',
      location: 'Corredor 1 · Prateleira A',
      supplier: 'Laticínios Bela Vista',
      batchCode: 'LT-2604A',
      quantity: 24,
      unit: 'L',
      unitPrice: 5.49,
      expirationDate: addDaysISO(2),
      status: 'ativo',
      presenceStatus: 'presente',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-2',
      barcode: '7891000053508',
      name: 'Iogurte Natural Integral 170g',
      brand: 'Nestlé',
      category: 'Laticínios',
      location: 'Resfriados · Ilha 2',
      supplier: 'Distribuidora Sul',
      batchCode: 'IO-9912B',
      quantity: 12,
      unit: 'un',
      unitPrice: 4.29,
      expirationDate: addDaysISO(-1),
      status: 'ativo',
      presenceStatus: 'presente',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-3',
      barcode: '7896002300127',
      name: 'Pão de Forma Tradicional 480g',
      brand: 'Pullman',
      category: 'Padaria',
      location: 'Corredor 3 · Gôndola Pães',
      supplier: 'Bimbo Brasil',
      batchCode: 'PF-1108C',
      quantity: 9,
      unit: 'un',
      unitPrice: 8.9,
      expirationDate: addDaysISO(1),
      status: 'promocao',
      presenceStatus: 'presente',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-4',
      barcode: '7891515482312',
      name: 'Queijo Mussarela Fatiado 150g',
      brand: 'Sadia',
      category: 'Laticínios',
      location: 'Resfriados · Frios 1',
      supplier: 'BRF Alimentos',
      batchCode: 'QM-4402D',
      quantity: 16,
      unit: 'un',
      unitPrice: 9.75,
      expirationDate: addDaysISO(5),
      status: 'ativo',
      presenceStatus: 'presente',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-5',
      barcode: '7891991010856',
      name: 'Refrigerante Guaraná 2L',
      brand: 'Antarctica',
      category: 'Bebidas',
      location: 'Corredor 4 · Bebidas',
      supplier: 'Ambev Distribuidora',
      batchCode: 'GU-7731E',
      quantity: 42,
      unit: 'un',
      unitPrice: 9.49,
      expirationDate: addDaysISO(45),
      status: 'ativo',
      presenceStatus: 'presente',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-6',
      barcode: '7894900011517',
      name: 'Suco de Laranja Integral 900ml',
      brand: 'Natural One',
      category: 'Bebidas',
      location: 'Resfriados · Sucos',
      supplier: 'Natural One',
      batchCode: 'SL-3019F',
      quantity: 0,
      unit: 'un',
      unitPrice: 12.9,
      expirationDate: addDaysISO(6),
      status: 'ativo',
      presenceStatus: 'ruptura',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-7',
      barcode: '7891149103003',
      name: 'Cerveja Lager Long Neck 330ml',
      brand: 'Heineken',
      category: 'Bebidas',
      location: 'Corredor 4 · Cervejas',
      supplier: 'Heineken Brasil',
      batchCode: 'HN-8820G',
      quantity: 60,
      unit: 'un',
      unitPrice: 6.49,
      expirationDate: addDaysISO(90),
      status: 'ativo',
      presenceStatus: 'presente',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-8',
      barcode: '7896089012017',
      name: 'Café Torrado e Moído 500g',
      brand: 'Pilão',
      category: 'Mercearia',
      location: 'Corredor 2 · Matinais',
      supplier: 'JDE Peet’s',
      batchCode: 'CF-5510H',
      quantity: 30,
      unit: 'un',
      unitPrice: 18.9,
      expirationDate: addDaysISO(120),
      status: 'ativo',
      presenceStatus: 'presente',
      lastAuditedAt: now,
      createdAt: now,
    },
    {
      id: 'prod-9',
      barcode: '7891515921408',
      name: 'Presunto Cozido Sem Capa 200g',
      brand: 'Perdigão',
      category: 'Açougue',
      location: 'Resfriados · Frios 2',
      supplier: 'BRF Alimentos',
      batchCode: 'PR-2219J',
      quantity: 7,
      unit: 'un',
      unitPrice: 7.99,
      expirationDate: addDaysISO(3),
      status: 'ativo',
      presenceStatus: 'reposicao',
      lastAuditedAt: now,
      createdAt: now,
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif-1',
      title: 'Produto Vencido na Gôndola',
      body: 'Iogurte Natural Integral 170g (Nestlé) venceu ontem. Retirar imediatamente.',
      severity: 'critical',
      productId: 'prod-2',
      barcode: '7891000053508',
      createdAt: now,
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Vencimento Crítico (2 dias)',
      body: 'Leite Integral UHT 1L (Piracanjuba) — 24 L vencem em 2 dias. Avaliar promoção.',
      severity: 'warning',
      productId: 'prod-1',
      barcode: '7891000315507',
      createdAt: now,
      read: false,
    },
  ];

  const audits: AuditSession[] = [
    {
      id: 'audit-1',
      type: 'validade',
      auditorName: 'Lucas Mendes',
      sector: 'Resfriados & Laticínios',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      totalItems: 4,
      divergencesCount: 1,
      items: [
        {
          productId: 'prod-1',
          barcode: '7891000315507',
          productName: 'Leite Integral UHT 1L',
          expectedQty: 24,
          expectedExpiry: addDaysISO(2),
          verifiedExpiry: addDaysISO(2),
          presence: 'presente',
          divergence: false,
        },
        {
          productId: 'prod-2',
          barcode: '7891000053508',
          productName: 'Iogurte Natural Integral 170g',
          expectedQty: 12,
          expectedExpiry: addDaysISO(-1),
          verifiedExpiry: addDaysISO(-1),
          presence: 'presente',
          divergence: true,
          notes: 'Lote vencido identificado para recolhimento',
        },
      ],
    },
  ];

  const defaultLojaId = 'loja-matriz-01';
  const lojas: Loja[] = [
    {
      id: defaultLojaId,
      nome_loja: 'Loja Matriz Central',
      cor_borda: '#059669',
      ativa: true,
      limite_lojas: 100,
      limite_usuarios_por_loja: 50,
      created_at: now,
      updated_at: now,
    },
  ];

  const produtos: Produto[] = products.map((p) => ({
    id: p.id,
    nome: p.name,
    codigo_barras: p.barcode,
    plu: p.reducedCode || null,
    setor: p.category || 'Mercearia',
    quantidade: p.quantity,
    data_vencimento: p.expirationDate,
    loja_id: defaultLojaId,
    criado_em: Date.now(),
    created_at: p.createdAt,
    updated_at: p.createdAt,
  }));

  const catalogo_universal: CatalogoUniversalItem[] = products.map((p) => ({
    codigo_barras: p.barcode,
    nome: p.name,
    criado_em: now,
    atualizado_em: now,
  }));

  const usuarios: Usuario[] = [
    {
      id: 'usr_adm_global_001',
      matricula: '111111',
      nome: 'Administrador do Sistema (SaaS)',
      cargo: 'adm',
      setor: 'Todos',
      loja_id: null,
      ativo: true,
      created_at: now,
      updated_at: now,
    },
  ];

  const estoque: EstoqueItem[] = products.map((p, idx) => ({
    id: p.id,
    id_loja: defaultLojaId,
    produto: p.name,
    codigo_ean: p.barcode || '',
    codigo_reduzido: p.reducedCode || String(1001 + idx),
    codigo_fornecedor: p.supplierCode || 'FORN-01',
    quantidade: p.quantity,
    atualizado_em: now,
    criado_em: now,
  }));

  return {
    lojas,
    produtos,
    catalogo_universal,
    usuarios,
    products,
    estoque,
    audits,
    notifications,
    pushSettings: {
      enabled: true,
      daysBeforeExpiry: 3,
      autoCheckMinutes: 60,
      includeExpired: true,
      lastCheckedAt: now,
    },
    vapidKeys,
    subscriptions: [],
  };
}

function loadStore(): StoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createInitialStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoreData;

    const defaultLojaId = 'loja-matriz-01';

    if (!Array.isArray(parsed.lojas) || parsed.lojas.length === 0) {
      parsed.lojas = [
        {
          id: defaultLojaId,
          nome_loja: 'Loja Matriz Central',
          cor_borda: '#059669',
          ativa: true,
          limite_lojas: 100,
          limite_usuarios_por_loja: 50,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }

    if (!Array.isArray(parsed.produtos)) {
      parsed.produtos = (parsed.products || []).map((p) => ({
        id: p.id,
        nome: p.name,
        codigo_barras: p.barcode,
        plu: p.reducedCode || null,
        setor: p.category || 'Mercearia',
        quantidade: p.quantity,
        data_vencimento: p.expirationDate,
        loja_id: defaultLojaId,
        criado_em: Date.now(),
        created_at: p.createdAt,
        updated_at: p.createdAt,
      }));
    }

    if (!Array.isArray(parsed.catalogo_universal)) {
      parsed.catalogo_universal = (parsed.products || []).map((p) => ({
        codigo_barras: p.barcode,
        nome: p.name,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      }));
    }

    if (!Array.isArray(parsed.usuarios)) {
      parsed.usuarios = [
        {
          id: 'usr_adm_global_001',
          matricula: '111111',
          nome: 'Administrador do Sistema (SaaS)',
          cargo: 'adm',
          setor: 'Todos',
          loja_id: null,
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }

    if (!Array.isArray(parsed.estoque)) {
      parsed.estoque = (parsed.products || []).map((p, idx) => ({
        id: p.id,
        id_loja: defaultLojaId,
        produto: p.name,
        codigo_ean: p.barcode || '',
        codigo_reduzido: p.reducedCode || String(1001 + idx),
        codigo_fornecedor: p.supplierCode || 'FORN-01',
        quantidade: p.quantity,
        atualizado_em: p.createdAt || new Date().toISOString(),
        criado_em: p.createdAt || new Date().toISOString(),
      }));
    }
    return parsed;
  } catch {
    const initial = createInitialStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function saveStore(store: StoreData) {
  const serialized =
    store.products.length > 200
      ? JSON.stringify(store)
      : JSON.stringify(store, null, 2);
  fs.writeFileSync(STORE_PATH, serialized);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

async function dispatchPushToAll(
  store: StoreData,
  payload: { title: string; body: string; tag?: string; url?: string }
) {
  webpush.setVapidDetails(
    'mailto:contato@validamerc.app',
    store.vapidKeys.publicKey,
    store.vapidKeys.privateKey
  );

  const validSubs: webpush.PushSubscription[] = [];
  for (const sub of store.subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      validSubs.push(sub);
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode !== 410 && statusCode !== 404) {
        validSubs.push(sub);
      }
    }
  }
  if (validSubs.length !== store.subscriptions.length) {
    store.subscriptions = validSubs;
    saveStore(store);
  }
}

async function runExpirationCheck(store: StoreData): Promise<{
  checked: number;
  alertsGenerated: AppNotification[];
}> {
  const alerts: AppNotification[] = [];
  const activeProducts = store.products.filter((p) => p.status !== 'descartado');

  for (const prod of activeProducts) {
    const days = daysUntil(prod.expirationDate);
    const isExpired = days < 0 && store.pushSettings.includeExpired;
    const isNearExpiry = days >= 0 && days <= store.pushSettings.daysBeforeExpiry;

    if (isExpired || isNearExpiry) {
      const title =
        days < 0
          ? `Vencido: ${prod.name}`
          : days === 0
          ? `Vence Hoje: ${prod.name}`
          : `Vence em ${days}d: ${prod.name}`;

      const body =
        days < 0
          ? `${prod.brand} (${prod.quantity} ${prod.unit}) venceu há ${Math.abs(days)} dia(s) · ${prod.location}`
          : `${prod.brand} (${prod.quantity} ${prod.unit}) · Lote ${prod.batchCode} · ${prod.location}`;

      const notif: AppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        body,
        severity: days < 0 ? 'critical' : 'warning',
        productId: prod.id,
        barcode: prod.barcode,
        createdAt: new Date().toISOString(),
        read: false,
      };
      alerts.push(notif);
    }
  }

  if (alerts.length > 0) {
    store.notifications = [...alerts, ...store.notifications].slice(0, 60);
    if (store.pushSettings.enabled && store.subscriptions.length > 0) {
      const summaryTitle =
        alerts.length === 1
          ? alerts[0].title
          : `ValidaMerc: ${alerts.length} alertas de validade`;
      const summaryBody =
        alerts.length === 1
          ? alerts[0].body
          : `${alerts.filter((a) => a.severity === 'critical').length} vencido(s) e ${
              alerts.filter((a) => a.severity === 'warning').length
            } próximo(s) do vencimento.`;

      await dispatchPushToAll(store, {
        title: summaryTitle,
        body: summaryBody,
        tag: 'validamerc-batch-check',
        url: '/',
      });
    }
  }

  store.pushSettings.lastCheckedAt = new Date().toISOString();
  saveStore(store);

  return { checked: activeProducts.length, alertsGenerated: alerts };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  let store = loadStore();

  // Background automatic expiration check scheduler
  setInterval(async () => {
    try {
      store = loadStore();
      if (!store.pushSettings.enabled) return;
      const last = store.pushSettings.lastCheckedAt
        ? new Date(store.pushSettings.lastCheckedAt).getTime()
        : 0;
      const intervalMs = Math.max(1, store.pushSettings.autoCheckMinutes) * 60 * 1000;
      if (Date.now() - last >= intervalMs) {
        await runExpirationCheck(store);
      }
    } catch (e) {
      console.error('Background expiration check error:', e);
    }
  }, 60 * 1000);

  // Products API
  app.get('/api/products', (_req, res) => {
    store = loadStore();
    res.json(store.products);
  });

  app.post('/api/products', (req, res) => {
    store = loadStore();
    const body = req.body as Partial<ProductBatch>;
    if (!body.name || !body.barcode || !body.expirationDate) {
      res.status(400).json({ error: 'Nome, código de barras e data de validade são obrigatórios.' });
      return;
    }

    const newProduct: ProductBatch = {
      id: `prod-${Date.now()}`,
      reducedCode: body.reducedCode ? String(body.reducedCode).trim() : undefined,
      barcode: String(body.barcode).trim(),
      name: String(body.name).trim(),
      brand: String(body.brand || 'Marca Própria').trim(),
      category: body.category || 'Mercearia',
      location: String(body.location || 'Corredor Principal').trim(),
      supplier: String(body.supplier || 'Fornecedor Padrão').trim(),
      supplierCode: body.supplierCode ? String(body.supplierCode).trim() : undefined,
      batchCode: String(body.batchCode || `LT-${Math.floor(1000 + Math.random() * 9000)}`).trim(),
      quantity: Number(body.quantity ?? 1),
      unit: body.unit || 'un',
      unitPrice: Number(body.unitPrice ?? 0),
      expirationDate: String(body.expirationDate),
      status: body.status || 'ativo',
      presenceStatus: body.presenceStatus || (Number(body.quantity ?? 1) > 0 ? 'presente' : 'ruptura'),
      lastAuditedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    store.products.unshift(newProduct);
    saveStore(store);
    res.status(201).json(newProduct);
  });

  // Bulk Import from .xlsx spreadsheet (Robust chunk-friendly endpoint)
  app.post('/api/products/import', async (req, res) => {
    try {
      store = loadStore();
      const { items } = req.body as {
        items?: Array<{
          name?: string;
          supplierCode?: string;
          barcode?: string;
          reducedCode?: string;
          quantity?: number;
        }>;
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ ok: false, error: 'Nenhum item válido enviado para importação.' });
        return;
      }

      if (items.length > 5000) {
        res.status(400).json({
          ok: false,
          error: 'O teto máximo por lote de importação é de 5.000 linhas.',
        });
        return;
      }

      const now = new Date().toISOString();
      const defaultExpiry = addDaysISO(30);
      let inserted = 0;
      let updated = 0;
      const affectedProducts: ProductBatch[] = [];
      const newProducts: ProductBatch[] = [];

      const barcodeIndex = new Map<string, number>();
      const reducedIndex = new Map<string, number>();
      store.products.forEach((p, idx) => {
        if (p.barcode) barcodeIndex.set(p.barcode, idx);
        if (p.reducedCode) reducedIndex.set(p.reducedCode, idx);
      });

      for (let i = 0; i < items.length; i++) {
        const row = items[i];
        if (!row) continue;
        const name = String(row.name || '').trim();
        const barcode = String(row.barcode || '').trim();
        const reducedCode = String(row.reducedCode || '').trim();
        const supplierCode = String(row.supplierCode || '').trim();
        const quantity = Number(row.quantity ?? 0) || 0;

        if (!name && !barcode && !reducedCode) continue;

        let existingIdx = -1;
        if (barcode && barcodeIndex.has(barcode)) {
          existingIdx = barcodeIndex.get(barcode)!;
        } else if (reducedCode && reducedIndex.has(reducedCode)) {
          existingIdx = reducedIndex.get(reducedCode)!;
        }

        if (existingIdx !== -1) {
          store.products[existingIdx] = {
            ...store.products[existingIdx],
            name: name || store.products[existingIdx].name,
            barcode: barcode || store.products[existingIdx].barcode,
            reducedCode: reducedCode || store.products[existingIdx].reducedCode,
            supplierCode: supplierCode || store.products[existingIdx].supplierCode,
            quantity,
            presenceStatus: quantity > 0 ? 'presente' : 'ruptura',
            lastAuditedAt: now,
          };
          updated++;
          affectedProducts.push(store.products[existingIdx]);
        } else {
          const created: ProductBatch = {
            id: `prod-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            reducedCode: reducedCode || undefined,
            barcode: barcode || reducedCode || `IMP-${Date.now()}-${i}`,
            name: name || `Produto ${reducedCode || barcode}`,
            brand: 'Importado',
            category: 'Mercearia',
            location: 'Estoque Geral',
            supplier: supplierCode ? `Fornecedor ${supplierCode}` : 'Fornecedor Padrão',
            supplierCode: supplierCode || undefined,
            batchCode: `LT-${Math.floor(1000 + Math.random() * 9000)}`,
            quantity,
            unit: 'un',
            unitPrice: 0,
            expirationDate: defaultExpiry,
            status: 'ativo',
            presenceStatus: quantity > 0 ? 'presente' : 'ruptura',
            lastAuditedAt: now,
            createdAt: now,
          };
          newProducts.push(created);
          inserted++;
          affectedProducts.push(created);
        }
      }

      if (newProducts.length > 0) {
        store.products = [...newProducts, ...store.products];
      }

      saveStore(store);

      // Sincronização segura com Supabase em segundo plano se configurado
      let supabaseSynced = false;
      const { raw } = getEffectiveIntegrations();
      if (raw.supabaseUrl && raw.supabaseKey && affectedProducts.length > 0) {
        try {
          const sbPayload = affectedProducts.slice(0, 500).map((p) => ({
            id: p.id,
            reduced_code: p.reducedCode || null,
            barcode: p.barcode,
            name: p.name,
            supplier_code: p.supplierCode || null,
            supplier: p.supplier,
            brand: p.brand,
            category: p.category,
            location: p.location,
            batch_code: p.batchCode,
            quantity: p.quantity,
            unit: p.unit,
            unit_price: p.unitPrice,
            expiration_date: p.expirationDate,
            status: p.status,
            presence_status: p.presenceStatus,
            updated_at: now,
          }));

          const sbRes = await fetch(
            `${raw.supabaseUrl}/rest/v1/validamerc_products?on_conflict=id`,
            {
              method: 'POST',
              headers: {
                apikey: raw.supabaseKey,
                Authorization: `Bearer ${raw.supabaseKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify(sbPayload),
              signal: AbortSignal.timeout(5000),
            }
          );
          supabaseSynced = sbRes.ok;
        } catch {
          // Mantém sucesso da importação mesmo se Supabase estiver inacessível
          supabaseSynced = false;
        }
      }

      res.status(200).json({
        ok: true,
        inserted,
        updated,
        total: inserted + updated,
        supabaseSynced,
      });
    } catch (err) {
      console.error('Erro na importação de produtos:', err);
      const message = err instanceof Error ? err.message : 'Erro interno ao processar dados';
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ============================================================================
  // ROTAS ADAPTADAS AO NOVO BANCO DE DADOS (Synk / ValidaMerc 2026 Master)
  // Tabelas: lojas, produtos, produtos_catalogo_universal, estoque
  // ============================================================================

  // Obter lista de lojas cadastradas
  app.get('/api/lojas', (req, res) => {
    store = loadStore();
    res.json({
      ok: true,
      total: store.lojas.length,
      lojas: store.lojas,
    });
  });

  // Criar ou atualizar loja
  app.post('/api/lojas', async (req, res) => {
    store = loadStore();
    const body = req.body || {};
    const now = new Date().toISOString();
    const id = body.id || `loja-${Date.now()}`;
    const nome_loja = String(body.nome_loja || 'Nova Filial').trim();
    const cor_borda = String(body.cor_borda || '#059669').trim();

    const existingIdx = store.lojas.findIndex((l) => l.id === id);
    const lojaObj: Loja = {
      id,
      nome_loja,
      cor_borda,
      ativa: body.ativa !== false,
      matriz_id: body.matriz_id || null,
      matrix_uuid: body.matrix_uuid || null,
      limite_lojas: Number(body.limite_lojas) || 100,
      limite_usuarios_por_loja: Number(body.limite_usuarios_por_loja) || 50,
      cnpj: body.cnpj || undefined,
      endereco: body.endereco || undefined,
      telefone: body.telefone || undefined,
      created_at: existingIdx !== -1 ? store.lojas[existingIdx].created_at : now,
      updated_at: now,
    };

    if (existingIdx !== -1) {
      store.lojas[existingIdx] = lojaObj;
    } else {
      store.lojas.push(lojaObj);
    }
    saveStore(store);

    // Sincroniza loja com Supabase public.lojas se configurado
    const { raw } = getEffectiveIntegrations();
    if (raw.supabaseUrl && raw.supabaseKey) {
      try {
        await fetch(`${raw.supabaseUrl}/rest/v1/lojas?on_conflict=id`, {
          method: 'POST',
          headers: {
            apikey: raw.supabaseKey,
            Authorization: `Bearer ${raw.supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify([
            {
              id: lojaObj.id,
              nome_loja: lojaObj.nome_loja,
              cor_borda: lojaObj.cor_borda,
              ativa: lojaObj.ativa,
              matriz_id: lojaObj.matriz_id,
              limite_lojas: lojaObj.limite_lojas,
              limite_usuarios_por_loja: lojaObj.limite_usuarios_por_loja,
              updated_at: now,
            },
          ]),
          signal: AbortSignal.timeout(4000),
        });
      } catch {
        // Ignora erro de rede mantendo persistência local
      }
    }

    res.status(201).json({ ok: true, loja: lojaObj });
  });

  // Consulta do Catálogo Universal de Produtos por Código de Barras
  app.get('/api/catalogo-universal/:barcode', (req, res) => {
    store = loadStore();
    const barcode = String(req.params.barcode).trim();
    const match = store.catalogo_universal.find((c) => c.codigo_barras === barcode);
    if (match) {
      res.json({ ok: true, found: true, item: match });
    } else {
      res.json({ ok: true, found: false });
    }
  });

  // Obter o script SQL Master Consolidado
  app.get(['/api/estoque/schema.sql', '/api/supabase/master-schema.sql'], (_req, res) => {
    const masterPath = path.resolve(process.cwd(), 'supabase', '00_EXECUTAR_TUDO_MASTER.sql');
    const fallbackPath = path.resolve(process.cwd(), 'supabase', 'schema.sql');
    const target = fs.existsSync(masterPath) ? masterPath : fallbackPath;
    if (fs.existsSync(target)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(fs.readFileSync(target, 'utf-8'));
    } else {
      res.status(404).send('-- Script SQL master não encontrado');
    }
  });

  // Obter itens de estoque / produtos
  app.get('/api/estoque', (req, res) => {
    store = loadStore();
    const idLoja = req.query.id_loja ? String(req.query.id_loja).trim() : '';
    const items = idLoja
      ? store.estoque.filter((item) => item.id_loja === idLoja)
      : store.estoque;
    res.json({
      ok: true,
      total: items.length,
      items,
    });
  });

  // Criar ou atualizar item individual de estoque
  app.post('/api/estoque', (req, res) => {
    store = loadStore();
    const body = req.body || {};
    const now = new Date().toISOString();
    const id = body.id || `est-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const id_loja = String(body.id_loja || body.loja_id || 'loja-matriz-01').trim();
    const produto = String(body.produto || body.nome || body.name || '').trim();
    const codigo_ean = String(body.codigo_ean || body.codigo_barras || body.barcode || '').trim();
    const codigo_reduzido = String(body.codigo_reduzido || body.plu || body.reducedCode || '').trim();
    const codigo_fornecedor = String(body.codigo_fornecedor || body.supplierCode || '').trim();
    const quantidade = Number(body.quantidade ?? body.quantity ?? 0) || 0;

    const existingIdx = store.estoque.findIndex((e) => e.id === id);
    if (existingIdx !== -1) {
      store.estoque[existingIdx] = {
        ...store.estoque[existingIdx],
        id_loja,
        produto: produto || store.estoque[existingIdx].produto,
        codigo_ean,
        codigo_reduzido,
        codigo_fornecedor,
        quantidade,
        atualizado_em: now,
      };
      saveStore(store);
      res.json({ ok: true, item: store.estoque[existingIdx] });
    } else {
      const newItem: EstoqueItem = {
        id,
        id_loja,
        produto: produto || 'Produto Sem Descrição',
        codigo_ean,
        codigo_reduzido,
        codigo_fornecedor,
        quantidade,
        atualizado_em: now,
        criado_em: now,
      };
      store.estoque.unshift(newItem);
      saveStore(store);
      res.status(201).json({ ok: true, item: newItem });
    }
  });

  // Excluir item de estoque
  app.delete('/api/estoque/:id', (req, res) => {
    store = loadStore();
    const id = req.params.id;
    store.estoque = store.estoque.filter((item) => item.id !== id);
    store.produtos = store.produtos.filter((item) => item.id !== id);
    store.products = store.products.filter((item) => item.id !== id);
    saveStore(store);
    res.json({ ok: true });
  });

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

  // Importação de estoque em blocos (chunks de 10) com suporte ao novo schema Supabase (produtos e catalogo universal)
  app.post('/api/estoque/import', async (req, res) => {
    try {
      store = loadStore();
      const items = req.body?.items;
      const defaultLoja = String(req.body?.id_loja || req.body?.loja_id || 'loja-matriz-01').trim();

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          ok: false,
          error: 'A lista de itens enviada está vazia ou em formato inválido.',
        });
        return;
      }

      const now = new Date().toISOString();
      const defaultExpiry = addDaysISO(30);
      let inserted = 0;
      let updated = 0;
      const affectedEstoque: EstoqueItem[] = [];

      // Mapeia itens existentes para busca em O(1)
      const eanMap = new Map<string, number>();
      const reducedMap = new Map<string, number>();
      const idMap = new Map<string, number>();

      store.estoque.forEach((item, idx) => {
        idMap.set(item.id, idx);
        const loja = item.id_loja || defaultLoja;
        if (item.codigo_ean) eanMap.set(`${loja}:${item.codigo_ean.trim()}`, idx);
        if (item.codigo_reduzido) reducedMap.set(`${loja}:${item.codigo_reduzido.trim()}`, idx);
      });

      for (let i = 0; i < items.length; i++) {
        const row = items[i];
        if (!row) continue;

        const produto = String(row.produto || row.nome || row.name || '').trim();
        const codigo_ean = sanitizeBarcode(row.codigo_ean || row.codigo_barras || row.barcode || '');
        const codigo_reduzido = String(row.codigo_reduzido || row.plu || row.reducedCode || '').replace(/\.0+$/, '').trim();
        const codigo_fornecedor = String(row.codigo_fornecedor || row.supplierCode || '').replace(/\.0+$/, '').trim();
        const quantidade = parseQuantityBR(row.quantidade ?? row.quantity ?? 0);
        const id_loja = String(row.id_loja || row.loja_id || defaultLoja).trim();

        if (!produto && !codigo_ean && !codigo_reduzido) continue;

        let existingIdx = -1;
        const rowId = row.id ? String(row.id).trim() : '';
        if (rowId && idMap.has(rowId)) {
          existingIdx = idMap.get(rowId)!;
        } else if (codigo_ean && eanMap.has(`${id_loja}:${codigo_ean}`)) {
          existingIdx = eanMap.get(`${id_loja}:${codigo_ean}`)!;
        } else if (codigo_reduzido && reducedMap.has(`${id_loja}:${codigo_reduzido}`)) {
          existingIdx = reducedMap.get(`${id_loja}:${codigo_reduzido}`)!;
        }

        if (existingIdx !== -1) {
          store.estoque[existingIdx] = {
            ...store.estoque[existingIdx],
            id_loja,
            produto: produto || store.estoque[existingIdx].produto,
            codigo_ean: codigo_ean || store.estoque[existingIdx].codigo_ean,
            codigo_reduzido: codigo_reduzido || store.estoque[existingIdx].codigo_reduzido,
            codigo_fornecedor: codigo_fornecedor || store.estoque[existingIdx].codigo_fornecedor,
            quantidade,
            atualizado_em: now,
          };
          updated++;
          affectedEstoque.push(store.estoque[existingIdx]);
        } else {
          const newId = rowId || `est-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
          const newItem: EstoqueItem = {
            id: newId,
            id_loja,
            produto: produto || `Produto ${codigo_reduzido || codigo_ean}`,
            codigo_ean,
            codigo_reduzido,
            codigo_fornecedor,
            quantidade,
            atualizado_em: now,
            criado_em: now,
          };
          store.estoque.unshift(newItem);
          inserted++;
          affectedEstoque.push(newItem);

          idMap.set(newId, 0);
          if (codigo_ean) eanMap.set(`${id_loja}:${codigo_ean}`, 0);
          if (codigo_reduzido) reducedMap.set(`${id_loja}:${codigo_reduzido}`, 0);
        }

        // Alimenta o Catálogo Universal de Produtos
        if (codigo_ean && produto) {
          const catIdx = store.catalogo_universal.findIndex((c) => c.codigo_barras === codigo_ean);
          if (catIdx !== -1) {
            store.catalogo_universal[catIdx].nome = produto;
            store.catalogo_universal[catIdx].atualizado_em = now;
          } else {
            store.catalogo_universal.push({
              codigo_barras: codigo_ean,
              nome: produto,
              criado_em: now,
              atualizado_em: now,
            });
          }
        }
      }

      // Sincroniza também com store.produtos e store.products
      for (const item of affectedEstoque) {
        // store.produtos (Novo Schema)
        const prodIdx = store.produtos.findIndex(
          (p) =>
            (item.codigo_ean && p.codigo_barras === item.codigo_ean) ||
            (item.codigo_reduzido && p.plu === item.codigo_reduzido) ||
            p.id === item.id
        );
        if (prodIdx !== -1) {
          store.produtos[prodIdx].nome = item.produto || store.produtos[prodIdx].nome;
          store.produtos[prodIdx].quantidade = item.quantidade;
          store.produtos[prodIdx].updated_at = now;
        } else {
          store.produtos.unshift({
            id: item.id,
            nome: item.produto,
            codigo_barras: item.codigo_ean || item.codigo_reduzido || `IMP-${Date.now()}`,
            plu: item.codigo_reduzido || null,
            setor: 'Mercearia',
            quantidade: item.quantidade,
            data_vencimento: defaultExpiry,
            loja_id: item.id_loja || defaultLoja,
            criado_em: Date.now(),
            created_at: now,
            updated_at: now,
          });
        }

        // store.products (Controle de Validade e Auditorias)
        const pIdx = store.products.findIndex(
          (p) =>
            (item.codigo_ean && p.barcode === item.codigo_ean) ||
            (item.codigo_reduzido && p.reducedCode === item.codigo_reduzido) ||
            p.id === item.id
        );
        if (pIdx !== -1) {
          store.products[pIdx].name = item.produto || store.products[pIdx].name;
          store.products[pIdx].quantity = item.quantidade;
          store.products[pIdx].supplierCode = item.codigo_fornecedor || store.products[pIdx].supplierCode;
          store.products[pIdx].presenceStatus = item.quantidade > 0 ? 'presente' : 'ruptura';
          store.products[pIdx].lastAuditedAt = now;
        } else {
          store.products.unshift({
            id: item.id,
            name: item.produto,
            barcode: item.codigo_ean || item.codigo_reduzido || `IMP-${Date.now()}`,
            reducedCode: item.codigo_reduzido || undefined,
            supplierCode: item.codigo_fornecedor || undefined,
            brand: 'Estoque Central',
            category: 'Mercearia',
            location: 'Estoque Geral',
            supplier: item.codigo_fornecedor ? `Fornecedor ${item.codigo_fornecedor}` : 'Fornecedor Padrão',
            batchCode: `LT-${Math.floor(1000 + Math.random() * 9000)}`,
            quantity: item.quantidade,
            unit: 'un',
            unitPrice: 0,
            expirationDate: defaultExpiry,
            status: 'ativo',
            presenceStatus: item.quantidade > 0 ? 'presente' : 'ruptura',
            lastAuditedAt: now,
            createdAt: now,
          });
        }
      }

      saveStore(store);

      // Sincronização segura com o novo schema Supabase (public.produtos e public.produtos_catalogo_universal)
      let supabaseSynced = false;
      let supabaseMessage = '';
      const { raw } = getEffectiveIntegrations();
      if (raw.supabaseUrl && raw.supabaseKey && affectedEstoque.length > 0) {
        try {
          // 1. Tabela public.produtos do novo schema
          const sbProdutosPayload = affectedEstoque.map((e) => ({
            id: e.id,
            nome: e.produto,
            codigo_barras: e.codigo_ean || e.codigo_reduzido || `IMP-${Date.now()}`,
            plu: e.codigo_reduzido || null,
            setor: 'Mercearia',
            quantidade: e.quantidade,
            data_vencimento: defaultExpiry,
            loja_id: e.id_loja || defaultLoja,
            updated_at: now,
          }));

          const resProd = await fetch(
            `${raw.supabaseUrl}/rest/v1/produtos?on_conflict=id`,
            {
              method: 'POST',
              headers: {
                apikey: raw.supabaseKey,
                Authorization: `Bearer ${raw.supabaseKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify(sbProdutosPayload),
              signal: AbortSignal.timeout(6000),
            }
          );

          // 2. Tabela public.produtos_catalogo_universal
          const sbUniversal = affectedEstoque
            .filter((e) => e.codigo_ean && e.produto)
            .map((e) => ({
              codigo_barras: e.codigo_ean.trim(),
              nome: e.produto.trim(),
              atualizado_em: now,
            }));

          if (sbUniversal.length > 0) {
            try {
              await fetch(
                `${raw.supabaseUrl}/rest/v1/produtos_catalogo_universal?on_conflict=codigo_barras`,
                {
                  method: 'POST',
                  headers: {
                    apikey: raw.supabaseKey,
                    Authorization: `Bearer ${raw.supabaseKey}`,
                    'Content-Type': 'application/json',
                    Prefer: 'resolution=merge-duplicates',
                  },
                  body: JSON.stringify(sbUniversal),
                  signal: AbortSignal.timeout(4000),
                }
              );
            } catch {
              // Non-blocking
            }
          }

          if (resProd.ok) {
            supabaseSynced = true;
            supabaseMessage = 'Sincronizado com tabela produtos no Supabase.';
          } else {
            // Tenta fallback na tabela legada/separada estoque
            try {
              const sbEstoquePayload = affectedEstoque.map((e) => ({
                id: e.id,
                id_loja: e.id_loja,
                produto: e.produto,
                codigo_ean: e.codigo_ean || '',
                codigo_reduzido: e.codigo_reduzido || '',
                codigo_fornecedor: e.codigo_fornecedor || '',
                quantidade: e.quantidade,
                atualizado_em: now,
              }));

              const resEst = await fetch(
                `${raw.supabaseUrl}/rest/v1/estoque?on_conflict=id`,
                {
                  method: 'POST',
                  headers: {
                    apikey: raw.supabaseKey,
                    Authorization: `Bearer ${raw.supabaseKey}`,
                    'Content-Type': 'application/json',
                    Prefer: 'resolution=merge-duplicates',
                  },
                  body: JSON.stringify(sbEstoquePayload),
                  signal: AbortSignal.timeout(4000),
                }
              );
              supabaseSynced = resEst.ok;
              supabaseMessage = resEst.ok
                ? 'Sincronizado com tabela estoque no Supabase.'
                : 'Salvo localmente. Execute 00_EXECUTAR_TUDO_MASTER.sql no Supabase.';
            } catch {
              supabaseSynced = false;
              supabaseMessage = 'Salvo localmente. Supabase inacessível.';
            }
          }
        } catch {
          supabaseSynced = false;
          supabaseMessage = 'Salvo localmente com segurança.';
        }
      }

      res.status(200).json({
        ok: true,
        inserted,
        updated,
        total: inserted + updated,
        supabaseSynced,
        supabaseMessage,
        items: affectedEstoque,
      });
    } catch (err) {
      console.error('Erro na importação de estoque:', err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.patch('/api/products/:id', (req, res) => {
    store = loadStore();
    const idx = store.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Produto não encontrado' });
      return;
    }
    store.products[idx] = {
      ...store.products[idx],
      ...req.body,
      id: store.products[idx].id,
    };
    saveStore(store);
    res.json(store.products[idx]);
  });

  app.delete('/api/products/:id', (req, res) => {
    store = loadStore();
    store.products = store.products.filter((p) => p.id !== req.params.id);
    saveStore(store);
    res.json({ ok: true });
  });

  // Barcode lookup
  app.get('/api/barcode/:code', (req, res) => {
    store = loadStore();
    const code = req.params.code.trim();
    const matched = store.products.find((p) => p.barcode === code && p.status !== 'descartado') || null;
    res.json({ barcode: code, matchedProduct: matched });
  });

  // Google Gemini Vision Barcode & Expiration Date Scanner
  app.post('/api/ai/scan-barcode', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };
      if (!imageBase64) {
        res.status(400).json({ error: 'Imagem não fornecida.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(400).json({
          error: 'Chave GEMINI_API_KEY não configurada no ambiente.',
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'image/jpeg',
            },
          },
          {
            text: 'Analise esta imagem de embalagem de produto de supermercado. Extraia o código de barras numérico (EAN-13, EAN-8, UPC ou Code-128), o nome do produto, a marca, o código do lote e a data de validade impressa (converta para o formato YYYY-MM-DD se visível). Se algum campo não estiver visível, retorne string vazia.',
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              barcode: { type: Type.STRING },
              productName: { type: Type.STRING },
              brand: { type: Type.STRING },
              expirationDate: { type: Type.STRING },
              batchCode: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}') as {
        barcode?: string;
        productName?: string;
        brand?: string;
        expirationDate?: string;
        batchCode?: string;
      };

      store = loadStore();
      const barcodeStr = parsed.barcode ? parsed.barcode.trim() : '';
      const matchedProduct = barcodeStr
        ? store.products.find((p) => p.barcode === barcodeStr) || null
        : null;

      res.json({
        barcode: parsed.barcode || '',
        productName: parsed.productName || '',
        brand: parsed.brand || '',
        expirationDate: parsed.expirationDate || '',
        batchCode: parsed.batchCode || '',
        engine: 'Google Gemini Vision',
        matchedProduct,
      });
    } catch (err) {
      console.error('Gemini Vision scan error:', err);
      res.status(500).json({ error: 'Falha ao analisar imagem com Google Gemini Vision.' });
    }
  });

  // Audits API
  app.get('/api/audits', (_req, res) => {
    store = loadStore();
    res.json(store.audits);
  });

  app.post('/api/audits', (req, res) => {
    store = loadStore();
    const session = req.body as Omit<AuditSession, 'id' | 'createdAt'>;
    const newAudit: AuditSession = {
      ...session,
      id: `audit-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    // Apply audited changes to products
    const now = new Date().toISOString();
    for (const item of newAudit.items) {
      const idx = store.products.findIndex((p) => p.id === item.productId);
      if (idx !== -1) {
        if (newAudit.type === 'presenca' && item.presence) {
          store.products[idx].presenceStatus = item.presence;
        }
        if (newAudit.type === 'validade' && item.verifiedExpiry) {
          store.products[idx].expirationDate = item.verifiedExpiry;
        }
        if (newAudit.type === 'inventario' && typeof item.countedQty === 'number') {
          store.products[idx].quantity = item.countedQty;
          store.products[idx].presenceStatus = item.countedQty > 0 ? 'presente' : 'ruptura';
        }
        store.products[idx].lastAuditedAt = now;
      }
    }

    store.audits.unshift(newAudit);
    saveStore(store);
    res.status(201).json(newAudit);
  });

  // Push Notifications API
  app.get('/api/push/vapid-public-key', (_req, res) => {
    store = loadStore();
    res.json({ publicKey: store.vapidKeys.publicKey });
  });

  app.post('/api/push/subscribe', (req, res) => {
    store = loadStore();
    const sub = req.body as webpush.PushSubscription;
    if (!sub || !sub.endpoint) {
      res.status(400).json({ error: 'Inscrição push inválida' });
      return;
    }
    const exists = store.subscriptions.some((s) => s.endpoint === sub.endpoint);
    if (!exists) {
      store.subscriptions.push(sub);
      saveStore(store);
    }
    res.json({ ok: true, totalSubscriptions: store.subscriptions.length });
  });

  app.get('/api/push/settings', (_req, res) => {
    store = loadStore();
    res.json(store.pushSettings);
  });

  app.patch('/api/push/settings', (req, res) => {
    store = loadStore();
    store.pushSettings = {
      ...store.pushSettings,
      ...req.body,
    };
    saveStore(store);
    res.json(store.pushSettings);
  });

  app.post('/api/push/check-expirations', async (_req, res) => {
    store = loadStore();
    const result = await runExpirationCheck(store);
    res.json(result);
  });

  app.post('/api/push/test', async (_req, res) => {
    store = loadStore();
    const testNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: 'Teste de Notificação Push · ValidaMerc',
      body: 'As notificações automáticas de validade estão ativas neste dispositivo.',
      severity: 'info',
      createdAt: new Date().toISOString(),
      read: false,
    };
    store.notifications.unshift(testNotif);
    saveStore(store);

    if (store.subscriptions.length > 0) {
      await dispatchPushToAll(store, {
        title: testNotif.title,
        body: testNotif.body,
        tag: 'validamerc-test',
        url: '/',
      });
    }
    res.json({ ok: true, notification: testNotif });
  });

  // Notifications API
  app.get('/api/notifications', (_req, res) => {
    store = loadStore();
    res.json(store.notifications);
  });

  app.patch('/api/notifications/read', (_req, res) => {
    store = loadStore();
    store.notifications = store.notifications.map((n) => ({ ...n, read: true }));
    saveStore(store);
    res.json({ ok: true });
  });

  // ============================================================================
  // SERVER-SIDE ENCRYPTED CREDENTIAL VAULT (SUPABASE & VERCEL)
  // Secrets are encrypted at rest (AES-256-GCM) and NEVER returned to browser
  // ============================================================================
  const VAULT_PATH = path.join(DATA_DIR, 'vault.enc');
  const VAULT_KEY_PATH = path.join(DATA_DIR, '.vault.key');

  interface VaultData {
    supabase?: {
      url: string;
      serviceRoleKey: string;
      updatedAt: string;
    };
    vercel?: {
      token: string;
      projectId: string;
      teamId?: string;
      updatedAt: string;
    };
  }

  function getVaultMasterKey(): Buffer {
    const envKey = process.env.VAULT_MASTER_KEY;
    if (envKey && envKey.trim().length > 0) {
      return crypto.createHash('sha256').update(envKey.trim()).digest();
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(VAULT_KEY_PATH)) {
      return Buffer.from(fs.readFileSync(VAULT_KEY_PATH, 'utf-8').trim(), 'hex');
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(VAULT_KEY_PATH, generated.toString('hex'), { mode: 0o600 });
    return generated;
  }

  function readVault(): VaultData {
    if (!fs.existsSync(VAULT_PATH)) return {};
    try {
      const raw = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf-8')) as {
        iv: string;
        tag: string;
        ciphertext: string;
      };
      const key = getVaultMasterKey();
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(raw.iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(raw.tag, 'hex'));
      const decrypted =
        decipher.update(raw.ciphertext, 'hex', 'utf-8') + decipher.final('utf-8');
      return JSON.parse(decrypted) as VaultData;
    } catch {
      return {};
    }
  }

  function writeVault(data: VaultData) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const key = getVaultMasterKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext =
      cipher.update(JSON.stringify(data), 'utf-8', 'hex') + cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    fs.writeFileSync(
      VAULT_PATH,
      JSON.stringify({ iv: iv.toString('hex'), tag, ciphertext }),
      { mode: 0o600 }
    );
  }

  function maskSecret(secret: string): string {
    if (!secret || secret.length < 8) return '••••••••';
    return `••••••••${secret.slice(-4)}`;
  }

  function getEffectiveIntegrations() {
    const vault = readVault();
    const envSbUrl = process.env.SUPABASE_URL?.trim();
    const envSbKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const sbUrl = envSbUrl || vault.supabase?.url || '';
    const sbKey = envSbKey || vault.supabase?.serviceRoleKey || '';
    const sbSource: 'env' | 'vault' | 'none' =
      envSbUrl && envSbKey ? 'env' : vault.supabase?.url && vault.supabase?.serviceRoleKey ? 'vault' : 'none';

    const envVcelToken = process.env.VERCEL_TOKEN?.trim();
    const envVcelProj = process.env.VERCEL_PROJECT_ID?.trim();
    const envVcelTeam = process.env.VERCEL_TEAM_ID?.trim();
    const vcelToken = envVcelToken || vault.vercel?.token || '';
    const vcelProj = envVcelProj || vault.vercel?.projectId || '';
    const vcelTeam = envVcelTeam || vault.vercel?.teamId || '';
    const vcelSource: 'env' | 'vault' | 'none' =
      envVcelToken ? 'env' : vault.vercel?.token ? 'vault' : 'none';

    let urlHost = '';
    if (sbUrl) {
      try {
        urlHost = new URL(sbUrl).host;
      } catch {
        urlHost = sbUrl;
      }
    }

    return {
      raw: {
        supabaseUrl: sbUrl,
        supabaseKey: sbKey,
        vercelToken: vcelToken,
        vercelProjectId: vcelProj,
        vercelTeamId: vcelTeam,
      },
      publicStatus: {
        supabase: {
          configured: Boolean(sbUrl && sbKey),
          urlHost,
          keyHint: sbKey ? maskSecret(sbKey) : '',
          source: sbSource,
          updatedAt: vault.supabase?.updatedAt,
        },
        vercel: {
          configured: Boolean(vcelToken),
          projectId: vcelProj,
          teamId: vcelTeam,
          tokenHint: vcelToken ? maskSecret(vcelToken) : '',
          source: vcelSource,
          updatedAt: vault.vercel?.updatedAt,
        },
      },
    };
  }

  app.get('/api/integrations/status', (_req, res) => {
    const { publicStatus } = getEffectiveIntegrations();
    res.json(publicStatus);
  });

  app.post('/api/integrations/credentials', (req, res) => {
    const { provider, url, serviceRoleKey, token, projectId, teamId } = req.body as {
      provider?: 'supabase' | 'vercel';
      url?: string;
      serviceRoleKey?: string;
      token?: string;
      projectId?: string;
      teamId?: string;
    };

    const vault = readVault();
    const now = new Date().toISOString();

    if (provider === 'supabase') {
      if (!url?.trim() || !serviceRoleKey?.trim()) {
        res.status(400).json({ error: 'URL do Supabase e Service Role Key são obrigatórios.' });
        return;
      }
      vault.supabase = {
        url: url.trim().replace(/\/+$/, ''),
        serviceRoleKey: serviceRoleKey.trim(),
        updatedAt: now,
      };
      writeVault(vault);
    } else if (provider === 'vercel') {
      if (!token?.trim()) {
        res.status(400).json({ error: 'Token da Vercel é obrigatório.' });
        return;
      }
      vault.vercel = {
        token: token.trim(),
        projectId: (projectId || '').trim(),
        teamId: (teamId || '').trim(),
        updatedAt: now,
      };
      writeVault(vault);
    } else {
      res.status(400).json({ error: 'Provedor inválido.' });
      return;
    }

    const { publicStatus } = getEffectiveIntegrations();
    res.json(publicStatus);
  });

  app.delete('/api/integrations/credentials/:provider', (req, res) => {
    const vault = readVault();
    if (req.params.provider === 'supabase') {
      delete vault.supabase;
    } else if (req.params.provider === 'vercel') {
      delete vault.vercel;
    }
    writeVault(vault);
    const { publicStatus } = getEffectiveIntegrations();
    res.json(publicStatus);
  });

  app.post('/api/integrations/test-supabase', async (_req, res) => {
    const { raw } = getEffectiveIntegrations();
    if (!raw.supabaseUrl || !raw.supabaseKey) {
      res.status(400).json({ ok: false, message: 'Credenciais do Supabase não configuradas.' });
      return;
    }
    try {
      const response = await fetch(`${raw.supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: raw.supabaseKey,
          Authorization: `Bearer ${raw.supabaseKey}`,
        },
      });
      if (response.ok) {
        res.json({ ok: true, message: 'Conexão autenticada com Supabase via servidor.' });
      } else {
        res.status(400).json({
          ok: false,
          message: `Supabase retornou status HTTP ${response.status}. Verifique a URL e a Service Role Key.`,
        });
      }
    } catch {
      res.status(500).json({ ok: false, message: 'Não foi possível alcançar o servidor Supabase.' });
    }
  });

  app.post('/api/integrations/sync-supabase', async (_req, res) => {
    const { raw } = getEffectiveIntegrations();
    if (!raw.supabaseUrl || !raw.supabaseKey) {
      res.status(400).json({ ok: false, message: 'Credenciais do Supabase não configuradas.' });
      return;
    }
    store = loadStore();
    try {
      const payload = store.products.map((p) => ({
        id: p.id,
        reduced_code: p.reducedCode || null,
        barcode: p.barcode,
        name: p.name,
        supplier_code: p.supplierCode || null,
        supplier: p.supplier,
        brand: p.brand,
        category: p.category,
        location: p.location,
        batch_code: p.batchCode,
        quantity: p.quantity,
        unit: p.unit,
        unit_price: p.unitPrice,
        expiration_date: p.expirationDate,
        status: p.status,
        presence_status: p.presenceStatus,
        updated_at: new Date().toISOString(),
      }));

      const response = await fetch(
        `${raw.supabaseUrl}/rest/v1/validamerc_products?on_conflict=id`,
        {
          method: 'POST',
          headers: {
            apikey: raw.supabaseKey,
            Authorization: `Bearer ${raw.supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        res.json({
          ok: true,
          syncedCount: payload.length,
          message: `${payload.length} lotes sincronizados com a tabela validamerc_products no Supabase.`,
        });
      } else {
        const errText = await response.text();
        res.status(400).json({
          ok: false,
          message: `Erro HTTP ${response.status} ao sincronizar: ${errText.slice(0, 140)}`,
        });
      }
    } catch {
      res.status(500).json({ ok: false, message: 'Falha de rede ao sincronizar com Supabase.' });
    }
  });

  app.post('/api/integrations/test-vercel', async (_req, res) => {
    const { raw } = getEffectiveIntegrations();
    if (!raw.vercelToken) {
      res.status(400).json({ ok: false, message: 'Token da Vercel não configurado.' });
      return;
    }
    try {
      const endpoint = raw.vercelProjectId
        ? `https://api.vercel.com/v9/projects/${encodeURIComponent(raw.vercelProjectId)}${
            raw.vercelTeamId ? `?teamId=${encodeURIComponent(raw.vercelTeamId)}` : ''
          }`
        : `https://api.vercel.com/v2/user`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${raw.vercelToken}`,
        },
      });
      const data = (await response.json()) as {
        name?: string;
        framework?: string;
        user?: { username?: string };
        error?: { message?: string };
      };
      if (response.ok) {
        const label = data.name
          ? `Projeto "${data.name}" (${data.framework || 'vite'}) conectado`
          : `Conta Vercel "${data.user?.username || 'autenticada'}" conectada`;
        res.json({ ok: true, message: `${label} via servidor.` });
      } else {
        res.status(400).json({
          ok: false,
          message: data.error?.message || `Vercel retornou status HTTP ${response.status}.`,
        });
      }
    } catch {
      res.status(500).json({ ok: false, message: 'Não foi possível conectar à API da Vercel.' });
    }
  });

  const httpServer = http.createServer(app);

  // Vite or Static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ValidaMerc server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
