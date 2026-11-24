import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { Lock, RefreshCw, Search } from "lucide-react";
import { fetchAdminPermissions, updateAdminPermission } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";
import { ErrorState } from "../../components/common/StateView";

const adminOnlyPermissionCodes = new Set([
  "lms.admin.view",
  "lms.class.manage",
  "lms.teacher.assign",
  "lms.sync.retry",
  "lms.permission.manage",
]);

const SCOPE_OPTIONS = [
  { key: "ALL", label: "Tất cả" },
  { key: "Application", label: "Toàn hệ thống" },
  { key: "Course", label: "Khóa học" },
  { key: "Class", label: "Lớp học" },
  { key: "OwnData", label: "Dữ liệu cá nhân" },
];

const SCOPE_META = {
  Application: {
    label: "Toàn hệ thống",
    badge:
      "bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/60",
  },
  Course: {
    label: "Khóa học",
    badge:
      "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60",
  },
  Class: {
    label: "Lớp học",
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60",
  },
  OwnData: {
    label: "Dữ liệu cá nhân",
    badge:
      "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60",
  },
};

const CARD_CLASS =
  "rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none";
const FILTER_BAR_CLASS =
  "rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90";
const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";
const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function PermissionSwitch({ checked, disabled, locked, loading, onClick, title, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
        checked
          ? "border-emerald-500 bg-emerald-500"
          : "border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
      } ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
    >
      <span
        className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white shadow-xs transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      >
        {locked && <Lock className="h-2.5 w-2.5 text-slate-400" />}
        {loading && (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        )}
      </span>
    </button>
  );
}

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedScope, setSelectedScope] = useState("ALL");
  const [savingId, setSavingId] = useState(null);
  const [loadError, setLoadError] = useState("");

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetchAdminPermissions();
      if (!res?.success || !Array.isArray(res.data)) {
        throw new Error(res?.message || "Không thể tải danh sách quyền.");
      }
      setPermissions(res.data);
    } catch (err) {
      console.error("Error loading permissions:", err);
      setPermissions([]);
      setLoadError(err.message || "Không thể tải danh sách quyền.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const handleToggle = async (permId, role) => {
    const current = permissions.find((p) => p.id === permId);
    if (!current) return;
    const newValue = !current[role];

    setPermissions((prev) =>
      prev.map((p) => (p.id === permId ? { ...p, [role]: newValue } : p))
    );
    setSavingId(`${permId}_${role}`);

    try {
      await updateAdminPermission(permId, { [role]: newValue });
      const roleLabel = role === "teacher" ? "Giáo viên" : "Quản trị viên";
      toast.success(
        `Đã ${newValue ? "bật" : "tắt"} quyền "${current.name}" cho ${roleLabel}.`
      );
    } catch {
      setPermissions((prev) =>
        prev.map((p) => (p.id === permId ? { ...p, [role]: !newValue } : p))
      );
      toast.error("Cập nhật quyền thất bại. Vui lòng thử lại.");
    } finally {
      setSavingId(null);
    }
  };

  const scopeCounts = useMemo(() => {
    const counts = { ALL: permissions.length };
    for (const perm of permissions) {
      counts[perm.scope] = (counts[perm.scope] || 0) + 1;
    }
    return counts;
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return permissions.filter((perm) => {
      const matchesScope = selectedScope === "ALL" || perm.scope === selectedScope;
      const matchesSearch =
        !term ||
        perm.code.toLowerCase().includes(term) ||
        perm.name.toLowerCase().includes(term);
      return matchesScope && matchesSearch;
    });
  }, [permissions, selectedScope, searchTerm]);

  const groupedPermissions = useMemo(() => {
    const order = ["Application", "Course", "Class", "OwnData"];
    const groups = new Map();
    for (const perm of filteredPermissions) {
      const key = perm.scope || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(perm);
    }
    const keys = [
      ...order.filter((k) => groups.has(k)),
      ...[...groups.keys()].filter((k) => !order.includes(k)),
    ];
    return keys.map((key) => ({
      scope: key,
      label: SCOPE_META[key]?.label || key,
      items: groups.get(key),
    }));
  }, [filteredPermissions]);

  const getScopeBadge = (scope) => {
    const meta = SCOPE_META[scope];
    if (!meta) {
      return (
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {scope}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.badge}`}
      >
        {meta.label}
      </span>
    );
  };

  return (
    <div className="min-w-0 space-y-5 pb-8">
      {/* Compact Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Phân quyền hệ thống
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {loading || loadError
              ? "Quản lý quyền thao tác của Quản trị viên và Giáo viên theo từng phạm vi."
              : `Đang quản lý ${permissions.length} quyền thao tác; Quản trị viên luôn có toàn quyền mặc định.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadPermissions}
            disabled={loading}
            className={BTN_SECONDARY}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className={FILTER_BAR_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {SCOPE_OPTIONS.map(({ key, label }) => {
              const active = selectedScope === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedScope(key)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.2 text-[10px] ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400"
                    }`}
                  >
                    {scopeCounts[key] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên hoặc mã quyền..."
              className={`${INPUT_CLASS} pl-8`}
            />
          </div>
        </div>
      </div>

      {loadError && (
        <ErrorState
          title="Chưa thể tải ma trận phân quyền"
          message={loadError}
          onRetry={loadPermissions}
        />
      )}

      {/* Permission Matrix Table */}
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50/95 px-3 py-2.5 dark:bg-slate-800/95">
                  Chức năng & Mã quyền
                </th>
                <th className="px-3 py-2.5 text-center">Phạm vi</th>
                <th className="px-3 py-2.5 text-center">Quản trị viên</th>
                <th className="px-3 py-2.5 text-center">Giáo viên</th>
                <th className="px-3 py-2.5 text-center">Học viên</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/70 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12">
                    <Loading
                      loading={true}
                      text="Đang tải danh sách phân quyền..."
                      fullScreen={false}
                    />
                  </td>
                </tr>
              ) : loadError ? null : filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Không tìm thấy quyền nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                groupedPermissions.map((group) => (
                  <PermissionGroupRows
                    key={group.scope}
                    group={group}
                    showGroupHeader={selectedScope === "ALL"}
                    savingId={savingId}
                    onToggle={handleToggle}
                    getScopeBadge={getScopeBadge}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PermissionGroupRows({ group, showGroupHeader, savingId, onToggle, getScopeBadge }) {
  return (
    <>
      {showGroupHeader && (
        <tr className="bg-slate-50/70 dark:bg-slate-800/40">
          <td
            colSpan={5}
            className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            {group.label} ({group.items.length})
          </td>
        </tr>
      )}
      {group.items.map((perm) => {
        const isAdminOnly = adminOnlyPermissionCodes.has(perm.code);
        const isSavingTeacher = savingId === `${perm.id}_teacher`;
        return (
          <tr
            key={perm.id}
            className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
          >
            <td className="sticky left-0 z-10 bg-white/95 px-3 py-2.5 dark:bg-slate-900/95">
              <div className="font-semibold text-slate-900 dark:text-white">{perm.name}</div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                {perm.code}
              </div>
            </td>
            <td className="px-3 py-2.5 text-center">{getScopeBadge(perm.scope)}</td>

            {/* Admin Switch (Always locked ON) */}
            <td className="px-3 py-2.5 text-center">
              <div className="inline-flex items-center justify-center">
                <PermissionSwitch
                  checked={perm.admin}
                  disabled
                  locked
                  onClick={() => onToggle(perm.id, "admin")}
                  title="Quản trị viên luôn có toàn quyền"
                  ariaLabel={`Quyền quản trị viên cho ${perm.name}`}
                />
              </div>
            </td>

            {/* Teacher Switch */}
            <td className="px-3 py-2.5 text-center">
              <div className="inline-flex flex-col items-center justify-center gap-0.5">
                <PermissionSwitch
                  checked={perm.teacher}
                  disabled={isSavingTeacher || isAdminOnly}
                  locked={isAdminOnly}
                  loading={isSavingTeacher}
                  onClick={() => onToggle(perm.id, "teacher")}
                  title={
                    isAdminOnly
                      ? "Quyền chỉ dành cho Quản trị viên"
                      : "Nhấn để bật hoặc tắt quyền cho Giáo viên"
                  }
                  ariaLabel={`Quyền giáo viên cho ${perm.name}`}
                />
                {isAdminOnly && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    Chỉ quản trị
                  </span>
                )}
              </div>
            </td>

            {/* Student Column */}
            <td className="px-3 py-2.5 text-center">
              <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                Không áp dụng
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}
