import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  LayoutDashboard,
  Moon,
  Plus,
  ScanBarcode,
  Search,
  Sun,
  Tag,
  Trash2,
  Boxes,
} from 'lucide-react';
import { AuditView } from './components/AuditView';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { NotificationsView } from './components/NotificationsView';
import { ProductModal } from './components/ProductModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { StockView } from './components/StockView';
import type {
  AppNotification,
  AuditSession,
  BarcodeScanResult,
  ExpirySeverity,
  ProductBatch,
  ProductCategory,
  PushSettings,
} from './types';
import {
  exportProductsCSV,
  formatCurrencyBRL,
  formatDateBR,
  formatExpiryLabel,
  getExpirySeverity,
} from './utils/expiry';

type ActiveTab = 'painel' | 'estoque' | 'auditoria' | 'notificacoes';
type StatusFilter = 'todos' | 'vencido' | 'critico' | 'atencao' | 'ruptura';

const CACHE_KEY = 'validamerc_products_cache_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('painel');
  const [darkMode, setDarkMode] = useState(false);

  const [products, setProducts] = useState<ProductBatch[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? (JSON.parse(cached) as ProductBatch[]) : [];
    } catch {
      return [];
    }
  });
  const [audits, setAudits] = useState<AuditSession[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pushSettings, setPushSettings] = useState<PushSettings>({
    enabled: true,
    daysBeforeExpiry: 3,
    autoCheckMinutes: 60,
    includeExpired: true,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'Todas'>('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [scannerOpen, setScannerOpen] = useState(false);
  const [auditScanCallback, setAuditScanCallback] = useState<
    ((barcode: string) => void) | null
  >(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductBatch> | null>(null);
  const [scannedMatch, setScannedMatch] = useState<BarcodeScanResult | null>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const fetchAllData = useCallback(async () => {
    try {
      const [prodRes, auditRes, notifRes, settingsRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/audits'),
        fetch('/api/notifications'),
        fetch('/api/push/settings'),
      ]);

      if (prodRes.ok) {
        const prodData = (await prodRes.json()) as ProductBatch[];
        setProducts(prodData);
        localStorage.setItem(CACHE_KEY, JSON.stringify(prodData));
      }
      if (auditRes.ok) {
        setAudits(await auditRes.json());
      }
      if (notifRes.ok) {
        setNotifications(await notifRes.json());
      }
      if (settingsRes.ok) {
        setPushSettings(await settingsRes.json());
      }
    } catch {
      // Offline fallback uses cached state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.status !== 'descartado'),
    [products]
  );

  // KPI Metrics
  const kpis = useMemo(() => {
    let vencidos = 0;
    let criticos = 0;
    let atencao = 0;
    let rupturas = 0;

    for (const p of activeProducts) {
      const sev = getExpirySeverity(p.expirationDate, pushSettings.daysBeforeExpiry);
      if (sev === 'vencido') vencidos++;
      else if (sev === 'critico') criticos++;
      else if (sev === 'atencao') atencao++;

      if (p.presenceStatus === 'ruptura' || p.quantity === 0) {
        rupturas++;
      }
    }

    return {
      totalLotes: activeProducts.length,
      vencidos,
      criticos,
      atencao,
      rupturas,
    };
  }, [activeProducts, pushSettings.daysBeforeExpiry]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeProducts
      .filter((p) => {
        if (categoryFilter !== 'Todas' && p.category !== categoryFilter) {
          return false;
        }
        const sev = getExpirySeverity(p.expirationDate, pushSettings.daysBeforeExpiry);
        if (statusFilter === 'vencido' && sev !== 'vencido') return false;
        if (statusFilter === 'critico' && sev !== 'critico') return false;
        if (statusFilter === 'atencao' && sev !== 'atencao') return false;
        if (
          statusFilter === 'ruptura' &&
          p.presenceStatus !== 'ruptura' &&
          p.quantity > 0
        ) {
          return false;
        }
        if (q) {
          return (
            p.name.toLowerCase().includes(q) ||
            p.barcode.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.location.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
  }, [
    activeProducts,
    categoryFilter,
    statusFilter,
    searchQuery,
    pushSettings.daysBeforeExpiry,
  ]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Handlers
  const handleSaveProduct = async (data: Partial<ProductBatch>) => {
    if (data.id) {
      const res = await fetch(`/api/products/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchAllData();
      }
    } else {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchAllData();
      }
    }
  };

  const handleQuickStatusUpdate = async (
    id: string,
    patch: Partial<ProductBatch>
  ) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await fetchAllData();
    }
  };

  const handleBarcodeDetected = (result: BarcodeScanResult) => {
    setScannerOpen(false);
    if (auditScanCallback) {
      const cb = auditScanCallback;
      setAuditScanCallback(null);
      cb(result.barcode);
      return;
    }

    if (result.matchedProduct) {
      setScannedMatch(result);
    } else {
      setEditingProduct({
        barcode: result.barcode,
        name: result.productName || '',
        brand: result.brand || '',
        expirationDate: result.expirationDate || '',
        batchCode: result.batchCode || '',
      });
      setProductModalOpen(true);
    }
  };

  const handleSaveAudit = async (
    session: Omit<AuditSession, 'id' | 'createdAt'>
  ) => {
    const res = await fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    if (res.ok) {
      await fetchAllData();
    }
  };

  const handleUpdatePushSettings = async (settings: Partial<PushSettings>) => {
    const res = await fetch('/api/push/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setPushSettings(await res.json());
    }
  };

  const handleCheckExpirations = async () => {
    const res = await fetch('/api/push/check-expirations', { method: 'POST' });
    const data = await res.json();
    await fetchAllData();
    return data;
  };

  const handleTestPush = async () => {
    await fetch('/api/push/test', { method: 'POST' });
    await fetchAllData();
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications/read', { method: 'PATCH' });
    await fetchAllData();
  };

  const renderSeverityLabel = (severity: ExpirySeverity, expirationDate: string) => {
    const label = formatExpiryLabel(expirationDate);
    if (severity === 'vencido') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    if (severity === 'critico') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    if (severity === 'atencao') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between h-14 px-6 border-b border-slate-200 dark:border-slate-800">
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            ValidaMerc
          </span>
          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg"
            aria-label="Alternar tema"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <button
            type="button"
            onClick={() => setActiveTab('painel')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'painel'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Painel de Validade</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('estoque')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'estoque'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Boxes className="w-4 h-4 shrink-0" />
            <span>Estoque</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auditoria')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'auditoria'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>Auditoria & Inventário</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notificacoes')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'notificacoes'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-3">
              <Bell className="w-4 h-4 shrink-0" />
              <span>Alertas Push</span>
            </span>
            {unreadNotificationsCount > 0 && (
              <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {unreadNotificationsCount}
              </span>
            )}
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <PWAInstallButton />
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
            <p className="font-medium text-slate-700 dark:text-slate-300">
              Leitura Google Services
            </p>
            <p>ML Kit Barcode + Gemini Vision</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0 pb-20 md:pb-8">
        {/* Top Bar (56px desktop, 52px mobile) */}
        <header className="sticky top-0 z-30 h-[52px] md:h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="md:hidden text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              ValidaMerc
            </span>
            <span className="hidden md:inline text-sm font-semibold text-slate-900 dark:text-white truncate">
              {activeTab === 'painel' && 'Controle de Validade e Lotes'}
              {activeTab === 'estoque' && 'Gestão de Estoque e Importação (.xlsx)'}
              {activeTab === 'auditoria' && 'Auditoria de Presença, Validade e Inventário'}
              {activeTab === 'notificacoes' && 'Notificações Automáticas via Push'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="md:hidden">
              <PWAInstallButton compact />
            </div>
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="md:hidden p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Alternar tema"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuditScanCallback(null);
                setScannerOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <ScanBarcode className="w-4 h-4 shrink-0" />
              <span>Ler Código</span>
            </button>
          </div>
        </header>

        {/* Viewport Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {activeTab === 'painel' && (
            <>
              {/* 4-Column KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Vencidos na Gôndola
                  </p>
                  <p className="mt-1.5 text-2xl font-bold font-mono text-red-600 dark:text-red-400 tabular-nums">
                    {kpis.vencidos}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Retirada imediata
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Críticos (≤ {pushSettings.daysBeforeExpiry} dias)
                  </p>
                  <p className="mt-1.5 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                    {kpis.criticos}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Prioridade PVPS / Promoção
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Ruptura de Presença
                  </p>
                  <p className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                    {kpis.rupturas}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Sem estoque na gôndola
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Lotes Monitorados
                  </p>
                  <p className="mt-1.5 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {kpis.totalLotes}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {kpis.atencao} em atenção (4–7d)
                  </p>
                </div>
              </div>

              {/* Filter & Action Toolbar */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Segmented Filter */}
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-x-auto">
                    {(
                      [
                        { id: 'todos', label: 'Todos' },
                        { id: 'vencido', label: `Vencidos (${kpis.vencidos})` },
                        { id: 'critico', label: `Críticos (${kpis.criticos})` },
                        { id: 'atencao', label: `Atenção (${kpis.atencao})` },
                        { id: 'ruptura', label: `Ruptura (${kpis.rupturas})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                          statusFilter === tab.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportProductsCSV(filteredProducts)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[40px]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(null);
                        setProductModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-700 transition-colors min-h-[40px]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo Lote</span>
                    </button>
                  </div>
                </div>

                {/* Search & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="sm:col-span-2 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nome, marca, código de barras EAN ou corredor..."
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as ProductCategory | 'Todas')
                    }
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Todas">Todas as Categorias</option>
                    <option value="Laticínios">Laticínios</option>
                    <option value="Padaria">Padaria</option>
                    <option value="Açougue">Açougue</option>
                    <option value="Hortifrúti">Hortifrúti</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Mercearia">Mercearia</option>
                    <option value="Congelados">Congelados</option>
                    <option value="Higiene">Higiene</option>
                  </select>
                </div>
              </div>

              {/* Product List / Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                {loading && products.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Carregando lotes do mercado...
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nenhum lote encontrado para os filtros atuais.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('todos');
                        setCategoryFilter('Todas');
                        setSearchQuery('');
                      }}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Limpar Filtros
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Desktop High-Density Table */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                            <th className="py-3 px-4">Produto & EAN</th>
                            <th className="py-3 px-4">Localização</th>
                            <th className="py-3 px-4">Lote</th>
                            <th className="py-3 px-4 text-right">Estoque</th>
                            <th className="py-3 px-4">Validade</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                          {filteredProducts.map((p) => {
                            const sev = getExpirySeverity(
                              p.expirationDate,
                              pushSettings.daysBeforeExpiry
                            );
                            return (
                              <tr
                                key={p.id}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {p.name}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    <span className="font-mono">{p.barcode}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span>{p.brand}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span>{p.category}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                                  {p.location}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                                  {p.batchCode}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">
                                  <span
                                    className={
                                      p.quantity === 0
                                        ? 'text-red-600 dark:text-red-400 font-semibold'
                                        : 'text-slate-900 dark:text-white font-medium'
                                    }
                                  >
                                    {p.quantity} {p.unit}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                  {formatDateBR(p.expirationDate)}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="space-y-0.5">
                                    {renderSeverityLabel(sev, p.expirationDate)}
                                    {p.status === 'promocao' && (
                                      <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                        Em promoção PVPS
                                      </div>
                                    )}
                                    {p.presenceStatus === 'ruptura' && (
                                      <div className="text-[11px] font-medium text-red-600 dark:text-red-400">
                                        Ruptura na gôndola
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="inline-flex items-center gap-1">
                                    {p.status !== 'promocao' && sev !== 'em_dia' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleQuickStatusUpdate(p.id, {
                                            status: 'promocao',
                                          })
                                        }
                                        title="Colocar em promoção"
                                        className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg"
                                      >
                                        <Tag className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingProduct(p);
                                        setProductModalOpen(true);
                                      }}
                                      title="Editar lote"
                                      className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickStatusUpdate(p.id, {
                                          status: 'descartado',
                                        })
                                      }
                                      title="Dar baixa / Descartar lote"
                                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
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

                    {/* Mobile Touch List Rows */}
                    <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredProducts.map((p) => {
                        const sev = getExpirySeverity(
                          p.expirationDate,
                          pushSettings.daysBeforeExpiry
                        );
                        return (
                          <div key={p.id} className="p-4 space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {p.name}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  {p.brand} · {p.location}
                                </p>
                              </div>
                              <span className="text-xs font-mono font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                                {p.quantity} {p.unit}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              {renderSeverityLabel(sev, p.expirationDate)}
                              <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                                Val: {formatDateBR(p.expirationDate)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                              <span className="text-[11px] font-mono text-slate-400">
                                EAN {p.barcode}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProduct(p);
                                    setProductModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg min-h-[36px]"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleQuickStatusUpdate(p.id, {
                                      status: 'descartado',
                                    })
                                  }
                                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-slate-200 dark:border-slate-700 rounded-lg min-h-[36px]"
                                >
                                  Baixa
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === 'estoque' && (
            <StockView
              products={products}
              onQuickUpdate={handleQuickStatusUpdate}
              onEditProduct={(prod) => {
                setEditingProduct(prod);
                setProductModalOpen(true);
              }}
              onNewProduct={() => {
                setEditingProduct(null);
                setProductModalOpen(true);
              }}
              onRefresh={fetchAllData}
            />
          )}

          {activeTab === 'auditoria' && (
            <AuditView
              products={products}
              audits={audits}
              onSaveAudit={handleSaveAudit}
              onOpenAuditScanner={(onScanned) => {
                setAuditScanCallback(() => onScanned);
                setScannerOpen(true);
              }}
            />
          )}

          {activeTab === 'notificacoes' && (
            <NotificationsView
              notifications={notifications}
              pushSettings={pushSettings}
              onUpdateSettings={handleUpdatePushSettings}
              onCheckExpirations={handleCheckExpirations}
              onTestPush={handleTestPush}
              onMarkAllRead={handleMarkAllRead}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar (Thumb Zone - 4 items) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 pb-safe bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center">
        <button
          type="button"
          onClick={() => setActiveTab('painel')}
          className={`flex flex-col items-center justify-center h-full ${
            activeTab === 'painel'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Validade</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('estoque')}
          className={`flex flex-col items-center justify-center h-full ${
            activeTab === 'estoque'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Boxes className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Estoque</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('auditoria')}
          className={`flex flex-col items-center justify-center h-full ${
            activeTab === 'auditoria'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ClipboardCheck className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Auditoria</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('notificacoes')}
          className={`relative flex flex-col items-center justify-center h-full ${
            activeTab === 'notificacoes'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">
            Alertas{unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
          </span>
        </button>
      </nav>

      {/* Scanned Matched Product Quick-Action Modal */}
      {scannedMatch && scannedMatch.matchedProduct && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
          <div className="w-full max-w-md rounded-t-3xl md:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {scannedMatch.engine} · EAN {scannedMatch.barcode}
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {scannedMatch.matchedProduct.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {scannedMatch.matchedProduct.brand} · {scannedMatch.matchedProduct.location}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Validade Atual</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {formatDateBR(scannedMatch.matchedProduct.expirationDate)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Estoque / Preço</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {scannedMatch.matchedProduct.quantity} {scannedMatch.matchedProduct.unit} ·{' '}
                  {formatCurrencyBRL(scannedMatch.matchedProduct.unitPrice)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const prod = scannedMatch.matchedProduct!;
                  setScannedMatch(null);
                  setEditingProduct(prod);
                  setProductModalOpen(true);
                }}
                className="rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 min-h-[44px]"
              >
                Editar Validade / Qtd
              </button>
              <button
                type="button"
                onClick={() => {
                  const prod = scannedMatch.matchedProduct!;
                  setScannedMatch(null);
                  setEditingProduct({
                    barcode: prod.barcode,
                    name: prod.name,
                    brand: prod.brand,
                    category: prod.category,
                    location: prod.location,
                    supplier: prod.supplier,
                    unit: prod.unit,
                    unitPrice: prod.unitPrice,
                  });
                  setProductModalOpen(true);
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
              >
                Novo Lote deste EAN
              </button>
            </div>

            <button
              type="button"
              onClick={() => setScannedMatch(null)}
              className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          setAuditScanCallback(null);
        }}
        onDetected={handleBarcodeDetected}
      />

      {/* Product Add/Edit Modal */}
      <ProductModal
        isOpen={productModalOpen}
        onClose={() => {
          setProductModalOpen(false);
          setEditingProduct(null);
        }}
        onSave={handleSaveProduct}
        initialData={editingProduct}
        onOpenScanner={() => {
          setProductModalOpen(false);
          setScannerOpen(true);
        }}
      />

      <OfflineIndicator />
    </div>
  );
}
