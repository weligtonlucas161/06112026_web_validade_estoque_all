import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCheck,
  Clock,
  RefreshCw,
  Send,
} from 'lucide-react';
import type { AppNotification, PushSettings } from '../types';
import { formatDateBR } from '../utils/expiry';
import { showLocalPushNotification, subscribeToWebPush } from '../utils/pushClient';

interface NotificationsViewProps {
  notifications: AppNotification[];
  pushSettings: PushSettings;
  onUpdateSettings: (settings: Partial<PushSettings>) => Promise<void>;
  onCheckExpirations: () => Promise<{ checked: number; alertsGenerated: AppNotification[] }>;
  onTestPush: () => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  pushSettings,
  onUpdateSettings,
  onCheckExpirations,
  onTestPush,
  onMarkAllRead,
}) => {
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleEnablePush = async () => {
    const result = await subscribeToWebPush();
    if (typeof Notification !== 'undefined') {
      setPermissionState(Notification.permission);
    }
    if (result.granted) {
      await onUpdateSettings({ enabled: true });
      await showLocalPushNotification(
        'ValidaMerc Push Ativado',
        'Você receberá alertas automáticos sobre produtos próximos do vencimento.'
      );
      setStatusMessage('Notificações Push ativadas neste dispositivo.');
    } else {
      setStatusMessage(result.error || 'Não foi possível ativar as notificações.');
    }
  };

  const handleRunCheckNow = async () => {
    setChecking(true);
    setStatusMessage(null);
    try {
      const res = await onCheckExpirations();
      if (res.alertsGenerated.length > 0) {
        await showLocalPushNotification(
          `ValidaMerc: ${res.alertsGenerated.length} alerta(s) de validade`,
          res.alertsGenerated[0].body
        );
      }
      setStatusMessage(
        `${res.checked} lotes verificados · ${res.alertsGenerated.length} alerta(s) gerado(s).`
      );
    } finally {
      setChecking(false);
    }
  };

  const handleSendTest = async () => {
    await onTestPush();
    await showLocalPushNotification(
      'Teste de Notificação Push · ValidaMerc',
      'As notificações automáticas de validade estão funcionando perfeitamente.'
    );
    setStatusMessage('Notificação de teste enviada.');
  };

  return (
    <div className="space-y-6">
      {/* Push Configuration Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Notificações Automáticas via Push
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Permissão do navegador:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {permissionState === 'granted'
                  ? 'Concedida'
                  : permissionState === 'denied'
                  ? 'Bloqueada no navegador'
                  : 'Aguardando ativação'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {permissionState !== 'granted' && (
              <button
                type="button"
                onClick={handleEnablePush}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors min-h-[40px]"
              >
                <BellRing className="w-4 h-4" />
                <span>Ativar Push no Dispositivo</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSendTest}
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[40px]"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Testar Push</span>
            </button>
            <button
              type="button"
              onClick={handleRunCheckNow}
              disabled={checking}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50 transition-colors min-h-[40px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Verificando...' : 'Verificar Validades Agora'}</span>
            </button>
          </div>
        </div>

        {/* Rules Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Alertar com antecedência de
            </label>
            <select
              value={pushSettings.daysBeforeExpiry}
              onChange={(e) =>
                onUpdateSettings({ daysBeforeExpiry: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={1}>1 dia antes do vencimento</option>
              <option value={2}>2 dias antes do vencimento</option>
              <option value={3}>3 dias antes do vencimento</option>
              <option value={5}>5 dias antes do vencimento</option>
              <option value={7}>7 dias antes do vencimento</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Frequência da verificação automática
            </label>
            <select
              value={pushSettings.autoCheckMinutes}
              onChange={(e) =>
                onUpdateSettings({ autoCheckMinutes: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={15}>A cada 15 minutos</option>
              <option value={30}>A cada 30 minutos</option>
              <option value={60}>A cada 1 hora</option>
              <option value={360}>A cada 6 horas</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2.5 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={pushSettings.includeExpired}
                onChange={(e) =>
                  onUpdateSettings({ includeExpired: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Alertar também produtos já vencidos
              </span>
            </label>
          </div>
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Notification Feed */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Histórico de Alertas Push
            </h3>
          </div>
          {notifications.some((n) => !n.read) && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar todas como lidas</span>
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum alerta registrado no momento.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-5 py-3.5 flex items-start justify-between gap-4 ${
                  !n.read ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {n.severity === 'critical' ? (
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    ) : n.severity === 'warning' ? (
                      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {n.body}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
                      {formatDateBR(n.createdAt)}
                      {n.barcode ? ` · EAN ${n.barcode}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
