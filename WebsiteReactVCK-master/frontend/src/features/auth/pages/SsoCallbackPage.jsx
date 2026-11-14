import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Shield } from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import {
  confirmSsoSafeLink,
  consumeSsoCode,
  extractAndStripSsoParams,
  isSafeRelativeRedirectPath,
  SsoApiError,
} from "../../api/ssoClient";

const pendingConsumeMap = new Map();

function mapSsoError(error) {
  const code = error instanceof SsoApiError ? error.code : "SSO_ERROR";
  const rawMessage = error instanceof Error ? error.message : "";
  const devices = error instanceof SsoApiError ? error.devices : [];

  if (code === "SSO_CODE_EXPIRED") {
    return {
      code,
      message: "Mã đăng nhập SSO đã hết hạn (60-120 giây). Vui lòng quay lại Moly Studio và bấm \"Vào học\" lại.",
      devices,
    };
  }
  if (code === "SSO_CODE_ALREADY_USED") {
    return {
      code,
      message: "Mã đăng nhập SSO này đã được sử dụng. Vui lòng tạo phiên đăng nhập mới từ Moly Studio.",
      devices,
    };
  }
  if (code === "PRIVILEGED_ROLE_COLLISION") {
    return {
      code,
      message: "Tài khoản quản trị hoặc giáo viên không thể liên kết tự động qua SSO. Vui lòng đăng nhập trực tiếp bằng tài khoản CSCA-Course.",
      devices,
    };
  }
  if (code === "DEVICE_LIMIT_REACHED" || code === "ACCOUNT_LOCKED_DEVICE_LIMIT") {
    return {
      code,
      message: rawMessage || "Tài khoản đã đạt giới hạn thiết bị tin cậy của CSCA-Course.",
      devices,
    };
  }
  if (code === "ENTITLEMENT_REVOKED" || code === "USER_ACCESS_REVOKED" || code === "IDENTITY_REVOKED") {
    return {
      code,
      message: rawMessage || "Quyền truy cập khóa học hoặc tài khoản SSO đã bị thu hồi.",
      devices,
    };
  }
  return {
    code,
    message: rawMessage || "Không thể xác thực đăng nhập SSO từ Moly Studio. Vui lòng thử lại.",
    devices,
  };
}

export default function SsoCallbackPage() {
  const navigate = useNavigate();
  const { authUser, setAuthUser, setIsAuthenticated, fetchCurrentUser } = useAuthContext();

  const [phase, setPhase] = useState("loading");
  const [linkState, setLinkState] = useState(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorInfo, setErrorInfo] = useState({ code: "", message: "", devices: [] });

  useEffect(() => {
    const params = extractAndStripSsoParams();
    if (!params) {
      setErrorInfo({
        code: "SSO_PARAMS_MISSING",
        message: "Thiếu mã đăng nhập SSO hợp lệ. Vui lòng mở lại từ Moly Studio.",
        devices: [],
      });
      setPhase("error");
      return;
    }

    const dedupeKey = `${params.code}:${params.state}`;
    let promise = pendingConsumeMap.get(dedupeKey);
    if (!promise) {
      promise = consumeSsoCode(params);
      pendingConsumeMap.set(dedupeKey, promise);
    }

    let cancelled = false;
    promise
      .then(async (result) => {
        if (cancelled) return;
        if (result?.status === "LINK_REQUIRED" && result.linkToken) {
          setLinkState({
            linkToken: result.linkToken,
            email: result.email || "",
            hasPassword: Boolean(result.hasPassword),
            targetPath: isSafeRelativeRedirectPath(result.targetPath) ? result.targetPath : "/lms/dashboard",
          });
          setPhase("link_required");
          return;
        }
        if (result?.status === "AUTHENTICATED") {
          if (result.user) {
            setAuthUser(result.user);
            setIsAuthenticated(true);
          }
          await fetchCurrentUser().catch(() => {});
          const nextPath = isSafeRelativeRedirectPath(result.redirectPath) ? result.redirectPath : "/lms/dashboard";
          navigate(nextPath, { replace: true });
          return;
        }
        setErrorInfo({
          code: "INVALID_SSO_RESPONSE",
          message: "Phản hồi xác thực SSO không hợp lệ.",
          devices: [],
        });
        setPhase("error");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorInfo(mapSsoError(err));
        setPhase("error");
      })
      .finally(() => {
        setTimeout(() => pendingConsumeMap.delete(dedupeKey), 3000);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchCurrentUser, navigate, setAuthUser, setIsAuthenticated]);

  const handleConfirmLink = async (event) => {
    event?.preventDefault?.();
    if (!linkState || submitting) return;
    setSubmitting(true);
    setErrorInfo({ code: "", message: "", devices: [] });
    try {
      const result = await confirmSsoSafeLink({
        linkToken: linkState.linkToken,
        password: password || null,
      });
      if (result?.user) {
        setAuthUser(result.user);
        setIsAuthenticated(true);
      }
      await fetchCurrentUser().catch(() => {});
      const nextPath = isSafeRelativeRedirectPath(result?.redirectPath)
        ? result.redirectPath
        : linkState.targetPath;
      navigate(nextPath, { replace: true });
    } catch (err) {
      setErrorInfo(mapSsoError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center px-4 py-12">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-600 dark:text-sky-400" />
          <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">
            Đang kết nối tài khoản học tập
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Hệ thống đang xác thực phiên một lần từ Moly Studio...
          </p>
        </div>
      </div>
    );
  }

  if (phase === "link_required" && linkState) {
    const activeEmailMatches =
      Boolean(authUser?.email)
      && authUser.email.trim().toLowerCase() === linkState.email.trim().toLowerCase();

    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center px-4 py-12">
        <div className="w-full rounded-3xl border border-amber-200 bg-white p-8 shadow-xl dark:border-amber-800/60 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-amber-700 dark:text-amber-300">
            <Shield className="h-7 w-7 shrink-0" />
            <h1 className="text-xl font-black">Xác minh liên kết tài khoản</h1>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Email <strong className="text-slate-900 dark:text-white">{linkState.email}</strong> đã tồn tại trên CSCA-Course nhưng chưa liên kết với Moly Studio. Vì lý do bảo mật, hãy xác nhận quyền sở hữu trước khi gộp liên kết.
          </p>

          {errorInfo.message ? (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {errorInfo.message}
            </div>
          ) : null}

          {activeEmailMatches ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/30">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Bạn đang đăng nhập đúng tài khoản CSCA-Course này
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmLink}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? "Đang liên kết..." : "Xác nhận liên kết tài khoản hiện tại"}
              </button>
            </div>
          ) : null}

          {linkState.hasPassword ? (
            <form onSubmit={handleConfirmLink} className="mt-5 space-y-4">
              <div>
                <label htmlFor="csca-sso-link-password" className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                  Mật khẩu tài khoản CSCA-Course
                </label>
                <input
                  id="csca-sso-link-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!activeEmailMatches}
                  placeholder="Nhập mật khẩu CSCA-Course để xác nhận"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || (!password && !activeEmailMatches)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-black text-white transition hover:bg-sky-700 disabled:opacity-60"
              >
                {submitting ? "Đang xác minh..." : "Xác minh mật khẩu & Vào học"}
              </button>
            </form>
          ) : !activeEmailMatches ? (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Tài khoản này chưa có mật khẩu trên CSCA-Course. Vui lòng đăng nhập CSCA-Course trước rồi thực hiện liên kết từ phiên đang hoạt động.
            </div>
          ) : null}

          <div className="mt-5 border-t border-slate-200 pt-4 text-center dark:border-slate-800">
            <Link to="/" className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
              Quay về trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center px-4 py-12">
      <div role="alert" className="w-full rounded-3xl border border-red-200 bg-white p-8 shadow-xl dark:border-red-900/60 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-7 w-7 shrink-0" />
          <h1 className="text-xl font-black">Không thể đăng nhập SSO</h1>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
          {errorInfo.message}
        </p>

        {errorInfo.devices.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/70">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Thiết bị tin cậy hiện có
            </p>
            <ul className="mt-2 space-y-2 text-xs text-slate-700 dark:text-slate-300">
              {errorInfo.devices.map((device, idx) => (
                <li key={device.id || idx} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                  <span className="truncate font-semibold">{device.deviceName || device.userAgent || "Thiết bị đã đăng ký"}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleDateString("vi-VN") : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/profile"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-slate-700"
          >
            Hồ sơ & Đăng nhập
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" /> Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
