import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  AlertCircle,
  Loader2,
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const formatBytes = (bytes) => {
  const num = Number(bytes || 0);
  if (!num) return "";
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(0)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
};

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  targetWidth,
  scrollRootRef,
  onVisible,
  protectViewOnly,
}) {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);
  const [rendered, setRendered] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1.414); // A4 fallback until page loads

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return undefined;

    const preloadObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldRender(true);
        }
      },
      {
        root: scrollRootRef?.current || null,
        rootMargin: "700px 0px",
        threshold: 0.01,
      },
    );
    preloadObserver.observe(el);

    const activeObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.35) {
          onVisible?.(pageNumber);
        }
      },
      {
        root: scrollRootRef?.current || null,
        threshold: [0.35, 0.6],
      },
    );
    activeObserver.observe(el);

    return () => {
      preloadObserver.disconnect();
      activeObserver.disconnect();
    };
  }, [pageNumber, scrollRootRef, onVisible]);

  useEffect(() => {
    if (!shouldRender || !pdfDoc || !targetWidth || targetWidth < 120) return undefined;
    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const ratio = baseViewport.height / Math.max(1, baseViewport.width);
        setAspectRatio(ratio);

        const cssScale = targetWidth / Math.max(1, baseViewport.width);
        // Cap DPR so high-res phones stay crisp without blowing WebKit canvas memory.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: cssScale * dpr });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore cancelled task
          }
          renderTaskRef.current = null;
        }

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(targetWidth)}px`;
        canvas.style.height = `${Math.floor(targetWidth * ratio)}px`;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        const task = page.render({ canvasContext: ctx, viewport: renderViewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) {
          setRendered(true);
        }
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.warn(`PDF page ${pageNumber} render warning:`, err);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, shouldRender, targetWidth]);

  const estimatedHeight = Math.max(180, Math.round(targetWidth * aspectRatio));

  return (
    <div
      ref={holderRef}
      onContextMenu={protectViewOnly ? (e) => e.preventDefault() : undefined}
      className="relative mx-auto flex items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10"
      style={{
        width: `${Math.floor(targetWidth)}px`,
        minHeight: rendered ? undefined : `${estimatedHeight}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        className={`block max-w-none ${protectViewOnly ? "select-none" : ""}`}
      />
      {!rendered && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-100/90 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="font-mono text-[11px] font-bold">Trang {pageNumber}</span>
        </div>
      )}
    </div>
  );
}

export default function PdfCanvasViewer({
  src,
  fileName = "Tài liệu PDF",
  knownSizeBytes = 0,
  protectViewOnly = true,
  inline = false,
  onOpenFullscreen,
}) {
  const scrollRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1); // 1 = fit width
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ percent: 0, loaded: 0, total: Number(knownSizeBytes || 0) });
  const [errorInfo, setErrorInfo] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Track viewport width so pages always fit cleanly on 360px phones -> 1440px monitors
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => {
      const padding = window.innerWidth < 640 ? 16 : 36;
      const available = Math.max(240, el.clientWidth - padding);
      setContainerWidth(available);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load PDF binary via authenticated same-origin fetch (zero PWA cookie loss, zero R2 CORS)
  useEffect(() => {
    if (!src) return undefined;
    const controller = new AbortController();
    let activePdf = null;
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setErrorInfo(null);
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      setProgress({ percent: 5, loaded: 0, total: Number(knownSizeBytes || 0) });

      try {
        const res = await fetch(src, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        const contentType = String(res.headers.get("content-type") || "").toLowerCase();

        if (!res.ok) {
          let serverMsg = "Không thể mở tài liệu PDF này.";
          let errorCode = "";
          if (contentType.includes("application/json")) {
            const payload = await res.json().catch(() => null);
            if (payload?.message) serverMsg = payload.message;
            if (payload?.errorCode) errorCode = payload.errorCode;
          }
          if (res.status === 401) {
            serverMsg = "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.";
          }
          const err = new Error(serverMsg);
          err.status = res.status;
          err.code = errorCode;
          throw err;
        }

        if (contentType.includes("text/html") || contentType.includes("application/json")) {
          const payload = contentType.includes("application/json")
            ? await res.json().catch(() => null)
            : null;
          throw new Error(payload?.message || "Phản hồi tài liệu không phải định dạng PDF hợp lệ.");
        }

        const headerTotal = Number(res.headers.get("content-length") || 0);
        const total = headerTotal || Number(knownSizeBytes || 0);

        let bytes;
        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const chunks = [];
          let loaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (cancelled) {
              reader.cancel().catch(() => {});
              return;
            }
            chunks.push(value);
            loaded += value.byteLength;
            const percent = total > 0
              ? Math.min(96, Math.max(8, Math.round((loaded / total) * 100)))
              : Math.min(90, 20 + Math.round(loaded / (512 * 1024)) * 10);
            setProgress({ percent, loaded, total });
          }
          const combined = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.byteLength;
          }
          bytes = combined;
        } else {
          const buf = await res.arrayBuffer();
          bytes = new Uint8Array(buf);
          setProgress({ percent: 95, loaded: bytes.byteLength, total: total || bytes.byteLength });
        }

        if (cancelled) return;

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          isEvalSupported: false,
          useSystemFonts: true,
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy().catch(() => {});
          return;
        }
        activePdf = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setProgress({ percent: 100, loaded: bytes.byteLength, total: bytes.byteLength });
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setErrorInfo({
          message: err?.message || "Không thể tải tài liệu PDF. Vui lòng thử lại.",
          status: err?.status || null,
          code: err?.code || null,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      controller.abort();
      if (activePdf) {
        activePdf.destroy().catch(() => {});
      }
    };
  }, [src, knownSizeBytes, reloadTick]);

  const handleVisible = useCallback((pageNum) => {
    setCurrentPage(pageNum);
  }, []);

  const baseFitWidth = Math.min(containerWidth || 340, 920);
  const pageWidth = Math.max(240, Math.round(baseFitWidth * zoom));

  const changeZoom = (delta) => {
    setZoom((prev) => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.max(0.75, Math.min(2.25, next));
    });
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-slate-900"
      onContextMenu={protectViewOnly ? (e) => e.preventDefault() : undefined}
    >
      {/* Compact Viewer Controls Sub-bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3 py-2 text-xs text-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          {numPages > 0 ? (
            <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-[11px] font-bold text-sky-300">
              Trang {currentPage} / {numPages}
            </span>
          ) : (
            <span className="truncate text-[11px] font-semibold text-slate-400">
              {loading ? "Đang nạp PDF..." : fileName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => changeZoom(-0.2)}
            disabled={zoom <= 0.75 || !pdfDoc}
            title="Thu nhỏ"
            aria-label="Thu nhỏ"
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            disabled={!pdfDoc}
            title="Vừa màn hình"
            className="min-w-[46px] rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[11px] font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => changeZoom(0.2)}
            disabled={zoom >= 2.25 || !pdfDoc}
            title="Phóng to"
            aria-label="Phóng to"
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          {inline && onOpenFullscreen && (
            <button
              type="button"
              onClick={onOpenFullscreen}
              className="ml-1 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs transition hover:bg-blue-500"
            >
              <Maximize2 className="h-3 w-3" />
              <span>Toàn màn hình</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Canvas Viewport */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto overscroll-contain bg-slate-950/90 px-2 py-3 sm:px-4 sm:py-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {loading && (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-4 text-center">
            <div className="w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-900/95 p-5 shadow-xl">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-400" />
              <p className="mt-3 text-xs font-extrabold text-white">Đang tải tài liệu PDF...</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] font-bold text-slate-400">
                <span className="text-sky-400">{progress.percent}%</span>
                <span>
                  {progress.loaded > 0
                    ? `${formatBytes(progress.loaded)}${progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ""}`
                    : "Đang kết nối..."}
                </span>
              </div>
            </div>
          </div>
        )}

        {!loading && errorInfo && (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-4 text-center">
            <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-slate-900/95 p-5 shadow-xl">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-extrabold text-white">
                Không thể mở tài liệu PDF
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                {errorInfo.message}
              </p>
              <button
                type="button"
                onClick={() => setReloadTick((n) => n + 1)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Thử tải lại</span>
              </button>
            </div>
          </div>
        )}

        {!loading && !errorInfo && pdfDoc && numPages > 0 && (
          <div className="flex flex-col items-center gap-3 pb-4">
            {Array.from({ length: numPages }, (_, idx) => (
              <PdfPageCanvas
                key={`${reloadTick}-${idx + 1}`}
                pdfDoc={pdfDoc}
                pageNumber={idx + 1}
                targetWidth={pageWidth}
                scrollRootRef={scrollRef}
                onVisible={handleVisible}
                protectViewOnly={protectViewOnly}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
