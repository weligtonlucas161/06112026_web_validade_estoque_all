import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  Database,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Triangle,
} from 'lucide-react';
import type { IntegrationStatusResponse } from '../types';

export const IntegrationsView: React.FC = () => {
  const [status, setStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Supabase write-only form fields (cleared immediately after submit)
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [sbBusy, setSbBusy] = useState(false);
  const [sbFeedback, setSbFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Vercel write-only form fields (cleared immediately after submit)
  const [vcelToken, setVcelToken] = useState('');
  const [vcelProjectId, setVcelProjectId] = useState('');
  const [vcelTeamId, setVcelTeamId] = useState('');
  const [vcelBusy, setVcelBusy] = useState(false);
  const [vcelFeedback, setVcelFeedback] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/status');
      if (res.ok) {
        setStatus(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbUrl.trim() || !sbKey.trim()) return;
    setSbBusy(true);
    setSbFeedback(null);
    try {
      const res = await fetch('/api/integrations/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'supabase',
          url: sbUrl.trim(),
          serviceRoleKey: sbKey.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        setSbUrl('');
        setSbKey('');
        setSbFeedback({
          ok: true,
          text: 'Credenciais do Supabase criptografadas e salvas no cofre do servidor.',
        });
      } else {
        setSbFeedback({ ok: false, text: data.error || 'Erro ao salvar credenciais.' });
      }
    } finally {
      setSbBusy(false);
    }
  };

  const handleTestSupabase = async () => {
    setSbBusy(true);
    setSbFeedback(null);
    try {
      const res = await fetch('/api/integrations/test-supabase', { method: 'POST' });
      const data = await res.json();
      setSbFeedback({ ok: Boolean(data.ok), text: data.message });
    } finally {
      setSbBusy(false);
    }
  };

  const handleSyncSupabase = async () => {
    setSbBusy(true);
    setSbFeedback(null);
    try {
      const res = await fetch('/api/integrations/sync-supabase', { method: 'POST' });
      const data = await res.json();
      setSbFeedback({ ok: Boolean(data.ok), text: data.message });
    } finally {
      setSbBusy(false);
    }
  };

  const handleRemoveProvider = async (provider: 'supabase' | 'vercel') => {
    const res = await fetch(`/api/integrations/credentials/${provider}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setStatus(await res.json());
      if (provider === 'supabase') {
        setSbFeedback({ ok: true, text: 'Credenciais do Supabase removidas do cofre.' });
      } else {
        setVcelFeedback({ ok: true, text: 'Credenciais da Vercel removidas do cofre.' });
      }
    }
  };

  const handleSaveVercel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vcelToken.trim()) return;
    setVcelBusy(true);
    setVcelFeedback(null);
    try {
      const res = await fetch('/api/integrations/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'vercel',
          token: vcelToken.trim(),
          projectId: vcelProjectId.trim(),
          teamId: vcelTeamId.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        setVcelToken('');
        setVcelProjectId('');
        setVcelTeamId('');
        setVcelFeedback({
          ok: true,
          text: 'Token da Vercel criptografado e salvo no cofre do servidor.',
        });
      } else {
        setVcelFeedback({ ok: false, text: data.error || 'Erro ao salvar token.' });
      }
    } finally {
      setVcelBusy(false);
    }
  };

  const handleTestVercel = async () => {
    setVcelBusy(true);
    setVcelFeedback(null);
    try {
      const res = await fetch('/api/integrations/test-vercel', { method: 'POST' });
      const data = await res.json();
      setVcelFeedback({ ok: Boolean(data.ok), text: data.message });
    } finally {
      setVcelBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Architecture Notice */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-3.5">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Cofre Criptografado no Servidor (Zero Exposição no Navegador)
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            As chaves do <strong>Supabase</strong> e da <strong>Vercel</strong> são enviadas
            apenas uma vez para o backend, criptografadas em repouso com{' '}
            <span className="font-mono">AES-256-GCM</span> e nunca retornam em respostas HTTP,
            DOM ou <span className="font-mono">localStorage</span>. Ao inspecionar a página
            (DevTools), apenas o status mascarado (<span className="font-mono">••••••••</span>) é
            exibido.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">
          Verificando cofre de credenciais...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SUPABASE CARD */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                    Supabase (Banco & Sync)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {status?.supabase.configured
                      ? `Conectado (${status.supabase.urlHost} · Chave ${status.supabase.keyHint})`
                      : 'Não configurado'}
                  </p>
                </div>
              </div>

              {status?.supabase.configured && status.supabase.source === 'vault' && (
                <button
                  type="button"
                  onClick={() => handleRemoveProvider('supabase')}
                  title="Remover credenciais do cofre"
                  className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handleSaveSupabase} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Project URL (<span className="font-mono">SUPABASE_URL</span>)
                </label>
                <input
                  type="url"
                  required
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                  placeholder="https://seu-projeto.supabase.co"
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Service Role Key (<span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>)
                </label>
                <input
                  type="password"
                  required
                  value={sbKey}
                  onChange={(e) => setSbKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={sbBusy}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors min-h-[40px]"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Salvar no Cofre</span>
                </button>

                {status?.supabase.configured && (
                  <>
                    <button
                      type="button"
                      onClick={handleTestSupabase}
                      disabled={sbBusy}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors min-h-[40px]"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${sbBusy ? 'animate-spin' : ''}`} />
                      <span>Testar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncSupabase}
                      disabled={sbBusy}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors min-h-[40px]"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      <span>Sincronizar Lotes</span>
                    </button>
                  </>
                )}
              </div>
            </form>

            {sbFeedback && (
              <div
                className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                  sbFeedback.ok
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                    : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
                }`}
              >
                {sbFeedback.text}
              </div>
            )}
          </div>

          {/* VERCEL CARD */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Triangle className="w-5 h-5 text-slate-900 dark:text-white shrink-0" />
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                    Vercel (Deploy & Projeto)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {status?.vercel.configured
                      ? `Conectado (Token ${status.vercel.tokenHint}${
                          status.vercel.projectId ? ` · ${status.vercel.projectId}` : ''
                        })`
                      : 'Não configurado'}
                  </p>
                </div>
              </div>

              {status?.vercel.configured && status.vercel.source === 'vault' && (
                <button
                  type="button"
                  onClick={() => handleRemoveProvider('vercel')}
                  title="Remover token do cofre"
                  className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handleSaveVercel} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Personal Access Token (<span className="font-mono">VERCEL_TOKEN</span>) *
                </label>
                <input
                  type="password"
                  required
                  value={vcelToken}
                  onChange={(e) => setVcelToken(e.target.value)}
                  placeholder="vcel_..."
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Project ID (Opcional)
                  </label>
                  <input
                    type="text"
                    value={vcelProjectId}
                    onChange={(e) => setVcelProjectId(e.target.value)}
                    placeholder="prj_..."
                    autoComplete="off"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Team ID (Opcional)
                  </label>
                  <input
                    type="text"
                    value={vcelTeamId}
                    onChange={(e) => setVcelTeamId(e.target.value)}
                    placeholder="team_..."
                    autoComplete="off"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={vcelBusy}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors min-h-[40px]"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Salvar no Cofre</span>
                </button>

                {status?.vercel.configured && (
                  <button
                    type="button"
                    onClick={handleTestVercel}
                    disabled={vcelBusy}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors min-h-[40px]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Validar Token</span>
                  </button>
                )}
              </div>
            </form>

            {vcelFeedback && (
              <div
                className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                  vcelFeedback.ok
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                    : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
                }`}
              >
                {vcelFeedback.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
