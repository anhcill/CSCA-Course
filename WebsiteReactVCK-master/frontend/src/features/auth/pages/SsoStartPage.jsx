import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { isSafeRelativeRedirectPath, startIncomingMolySso } from "../../api/ssoClient";

const pendingStartMap = new Map();

export default function SsoStartPage() {
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const rawTarget = searchParams.get("target_path");
    const targetPath = isSafeRelativeRedirectPath(rawTarget) ? rawTarget : null;
    const rawCourseId = searchParams.get("course_id");
    const courseId = rawCourseId && Number.isFinite(Number(rawCourseId)) ? Number(rawCourseId) : null;
    const offeringId = searchParams.get("offering_id") || null;

    const dedupeKey = `${targetPath || ""}|${courseId || ""}|${offeringId || ""}`;
    let promise = pendingStartMap.get(dedupeKey);
    if (!promise) {
      promise = startIncomingMolySso({ targetPath, courseId, offeringId });
      pendingStartMap.set(dedupeKey, promise);
    }

    let cancelled = false;
    promise
      .then((result) => {
        if (cancelled) return;
        const parsed = new URL(result?.authorizeUrl || "");
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          setErrorMsg("Liên kết xác thực SSO không hợp lệ.");
          return;
        }
        window.location.assign(parsed.toString());
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err?.message || "Không thể khởi tạo phiên đăng nhập SSO.");
      })
      .finally(() => {
        setTimeout(() => pendingStartMap.delete(dedupeKey), 3000);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
        {!errorMsg ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-600 dark:text-sky-400" />
            <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">
              Đang khởi tạo đăng nhập an toàn
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Trình duyệt đang thiết lập phiên xác thực một lần với Moly Studio...
            </p>
          </>
        ) : (
          <div role="alert">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">
              Không thể khởi tạo SSO
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{errorMsg}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                <ExternalLink className="h-4 w-4" /> Về trang chủ
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
