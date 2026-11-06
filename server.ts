import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import * as webpush from 'web-push';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  AppNotification,
  AuditSession,
  ProductBatch,
  PushSettings,
} from './src/types';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

interface StoreData {
  products: ProductBatch[];
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

  return {
    products,
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
    return JSON.parse(raw) as StoreData;
  } catch {
    const initial = createInitialStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function saveStore(store: StoreData) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
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
  app.use(express.json({ limit: '10mb' }));

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

  // Bulk Import from .xlsx spreadsheet
  app.post('/api/products/import', async (req, res) => {
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
      res.status(400).json({ error: 'Nenhum item válido enviado para importação.' });
      return;
    }

    const now = new Date().toISOString();
    const defaultExpiry = addDaysISO(30);
    let inserted = 0;
    let updated = 0;
    const affectedProducts: ProductBatch[] = [];

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const name = String(row.name || '').trim();
      const barcode = String(row.barcode || '').trim();
      const reducedCode = String(row.reducedCode || '').trim();
      const supplierCode = String(row.supplierCode || '').trim();
      const quantity = Number(row.quantity ?? 0) || 0;

      if (!name && !barcode && !reducedCode) continue;

      const existingIdx = store.products.findIndex(
        (p) =>
          (barcode && p.barcode === barcode) ||
          (reducedCode && p.reducedCode === reducedCode)
      );

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
          id: `prod-${Date.now()}-${i}`,
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
        store.products.unshift(created);
        inserted++;
        affectedProducts.push(created);
      }
    }

    saveStore(store);

    // Optional automatic sync to Supabase if configured
    let supabaseSynced = false;
    const { raw } = getEffectiveIntegrations();
    if (raw.supabaseUrl && raw.supabaseKey && affectedProducts.length > 0) {
      try {
        const sbPayload = affectedProducts.map((p) => ({
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
          }
        );
        supabaseSynced = sbRes.ok;
      } catch {
        // Keep local import successful even if Supabase is unreachable
      }
    }

    res.status(201).json({
      ok: true,
      inserted,
      updated,
      total: inserted + updated,
      supabaseSynced,
    });
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

  // Vite or Static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ValidaMerc server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
