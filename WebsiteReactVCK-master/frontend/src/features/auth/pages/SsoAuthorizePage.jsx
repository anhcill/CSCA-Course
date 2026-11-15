import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { authorizeMolySso, isSafeRelativeRedirectPath } from "../../api/ssoClient";

const pendingAuthorizeMap = new Map();

export default function SsoAuthorizePage() {
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const state = (searchParams.get("state") || "").trim();
    const codeChallenge = (searchParams.get("code_challenge") || "").trim();
    const codeChallengeMethod = (searchParams.get("code_challenge_method") || "S256").trim();
    const rawTarget = searchParams.get("target_path");
    const targetPath = isSafeRelativeRedirectPath(rawTarget) ? rawTarget : "/khoa-hoc";

    if (!state || !codeChallenge) {
      setErrorMsg("Thiếu tham số bảo mật PKCE hoặc state để kết nối với Moly Studio.");
      return;
    }

    const dedupeKey = `${state}:${codeChallenge}`;
    let promise = pendingAuthorizeMap.get(dedupeKey);
    if (!promise) {
      promise = authorizeMolySso({
        state,
        codeChallenge,
        codeChallengeMethod,
        targetPath,
      });
      pendingAuthorizeMap.set(dedupeKey, promise);
    }

    let cancelled = false;
    promise
      .then((result) => {
        if (cancelled) return;
        const parsed = new URL(result?.redirectUrl || result?.launchUrl || "");
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          setErrorMsg("Liên kết chuyển hướng Moly Studio không hợp lệ.");
          return;
        }
        window.location.assign(parsed.toString());
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err?.message || "Không thể xác nhận chuyển hướng sang Moly Studio.");
      })
      .finally(() => {
        setTimeout(() => pendingAuthorizeMap.delete(dedupeKey), 3000);
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
              Đang cấp quyền đăng nhập sang Moly Studio
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Hệ thống đang xác thực tài khoản CSCA-Course của bạn...
            </p>
          </>
        ) : (
          <div role="alert">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">
              Không thể mở Moly Studio
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{errorMsg}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to="/lms/my-learning"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                <ExternalLink className="h-4 w-4" /> Về khu vực học tập
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
