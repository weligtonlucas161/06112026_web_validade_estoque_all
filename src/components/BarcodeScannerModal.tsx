import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Keyboard, RefreshCw, ScanBarcode, Sparkles, Upload, X } from 'lucide-react';
import type { BarcodeScanResult } from '../types';

interface BarcodeDetectorInstance {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue: string; format: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): BarcodeDetectorInstance;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (result: BarcodeScanResult) => void;
  title?: string;
}

const SAMPLE_BARCODES = [
  { code: '7891000315507', label: 'Leite Piracanjuba 1L' },
  { code: '7891000053508', label: 'Iogurte Nestlé 170g' },
  { code: '7894900011517', label: 'Suco Natural One 900ml' },
  { code: '7891991010856', label: 'Guaraná Antarctica 2L' },
];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
  title = 'Leitor de Código de Barras',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasNativeDetector, setHasNativeDetector] = useState(false);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    setHasNativeDetector(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const resolveBarcode = async (
    code: string,
    engine: BarcodeScanResult['engine'],
    extra?: Partial<BarcodeScanResult>
  ) => {
    const clean = code.trim();
    if (!clean) return;
    setLastScanned(clean);

    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(clean)}`);
      const data = await res.json();
      stopCamera();
      onDetected({
        barcode: clean,
        engine,
        matchedProduct: data.matchedProduct || null,
        ...extra,
      });
    } catch {
      stopCamera();
      onDetected({
        barcode: clean,
        engine,
        matchedProduct: null,
        ...extra,
      });
    }
  };

  useEffect(() => {
    if (!isOpen || mode !== 'camera') {
      stopCamera();
      return;
    }

    let cancelled = false;
    let rafId = 0;

    async function startCamera() {
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
          });

          const scanLoop = async () => {
            if (cancelled) return;
            if (videoRef.current && videoRef.current.readyState >= 2) {
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  await resolveBarcode(
                    barcodes[0].rawValue,
                    'Google ML Kit (BarcodeDetector)'
                  );
                  return;
                }
              } catch {
                // Ignore transient frame errors
              }
            }
            rafId = requestAnimationFrame(scanLoop);
          };
          rafId = requestAnimationFrame(scanLoop);
        }
      } catch {
        if (!cancelled) {
          setCameraError(
            'Não foi possível acessar a câmera. Verifique as permissões do navegador ou use a leitura por foto / entrada manual.'
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stopCamera();
    };
  }, [isOpen, mode]);

  const handleCaptureWithGemini = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    await analyzeImageWithGemini(dataUrl);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await analyzeImageWithGemini(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const analyzeImageWithGemini = async (imageBase64: string) => {
    setIsAnalyzingAI(true);
    setCameraError(null);
    try {
      const res = await fetch('/api/ai/scan-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCameraError(data.error || 'Erro ao analisar imagem com Google Gemini Vision.');
        setIsAnalyzingAI(false);
        return;
      }
      if (!data.barcode && !data.productName) {
        setCameraError(
          'Nenhum código de barras ou rótulo legível encontrado na imagem. Tente aproximar a câmera.'
        );
        setIsAnalyzingAI(false);
        return;
      }

      stopCamera();
      onDetected({
        barcode: data.barcode || `AI-${Date.now().toString().slice(-8)}`,
        productName: data.productName,
        brand: data.brand,
        expirationDate: data.expirationDate,
        batchCode: data.batchCode,
        engine: 'Google Gemini Vision',
        matchedProduct: data.matchedProduct || null,
      });
    } catch {
      setCameraError('Falha de conexão ao processar imagem.');
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
      <div className="w-full max-w-lg rounded-t-3xl md:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <ScanBarcode className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasNativeDetector
                  ? 'Google ML Kit (BarcodeDetector) + Gemini Vision'
                  : 'Google Gemini Vision + Entrada EAN'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Fechar leitor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-colors min-h-[40px] ${
                mode === 'camera'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Câmera Google Service</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-colors min-h-[40px] ${
                mode === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Digitar / Simular EAN</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {mode === 'camera' ? (
            <>
              <div className="relative aspect-video w-full rounded-xl bg-slate-950 overflow-hidden border border-slate-200 dark:border-slate-800">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Viewfinder reticle */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-3/4 h-28 rounded-xl border-2 border-emerald-400/80 relative">
                    <div className="absolute inset-x-2 top-1/2 h-0.5 bg-emerald-400/90" />
                  </div>
                </div>

                {lastScanned && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-lg bg-emerald-950/90 px-3 py-2 text-xs font-mono text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Código detectado: {lastScanned}</span>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 text-xs text-amber-800 dark:text-amber-200">
                  {cameraError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleCaptureWithGemini}
                  disabled={isAnalyzingAI || !!cameraError}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  {isAnalyzingAI ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {isAnalyzingAI
                      ? 'Lendo Código e Validade...'
                      : 'Capturar Código + Validade (Gemini AI)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzingAI}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[44px]"
                >
                  <Upload className="w-4 h-4" />
                  <span>Foto</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resolveBarcode(manualCode, 'Entrada Manual');
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Código de Barras (EAN-13, EAN-8 ou UPC)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Ex: 7891000315507"
                    autoFocus
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors min-h-[44px]"
                  >
                    Buscar
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Códigos de teste rápido do mercado:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SAMPLE_BARCODES.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => resolveBarcode(item.code, 'Entrada Manual')}
                      className="flex flex-col items-start rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <span className="text-xs font-medium text-slate-900 dark:text-white truncate w-full">
                        {item.label}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {item.code}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
