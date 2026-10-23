
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  MessageSquare,
  Users,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Calendar,
  User,
  X,
  Pencil,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import {
  fetchTeacherClassesLookup,
  fetchSupportCases,
  saveSupportCase,
} from "../../api/lmsClient";
import { datetimeLocal } from "../components/workflowStyles";
import usePersistentClassSelection from "../hooks/usePersistentClassSelection";

const statesConfig = {
  open: {
    label: "Cần liên hệ",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    subtext: "Chưa trao đổi với học viên",
  },
  contacted: {
    label: "Đã liên hệ",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    subtext: "Đã gửi thông điệp / trao đổi",
  },
  scheduled: {
    label: "Đã hẹn hỗ trợ",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    subtext: "Có lịch hẹn kèm riêng",
  },
  resolved: {
    label: "Đã hoàn tất",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    subtext: "Đã giải quyết vấn đề",
  },
};

export default function StudentSupportPage() {
  const [params] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const classIds = useMemo(() => classes.map((item) => item.id), [classes]);
  const [classId, setClassId] = usePersistentClassSelection({
    scope: "student-support",
    availableClassIds: classIds,
    allValue: "",
    ready: classes.length > 0,
    preferredValue: params.get("classId") || null,
  });
  const [data, setData] = useState({ students: [], owners: [], cases: [] });
  const [status, setStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Load teacher's managed classes
  useEffect(() => {
    fetchTeacherClassesLookup()
      .then((r) => {
        const classList = Array.isArray(r?.data) ? r.data : [];
        setClasses(classList);
        setClassId((current) => (
          classList.some((item) => String(item.id) === String(current))
            ? current
            : String(classList[0]?.id || "")
        ));
      })
      .catch((e) => setError(e.message || "Không thể tải danh sách lớp học."));
  }, [setClassId]);

  // Load support cases for selected class
  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetchSupportCases(classId);
      setData(r.data || { students: [], owners: [], cases: [] });
    } catch (e) {
      setError(e.message || "Không thể tải danh sách hồ sơ hỗ trợ.");
      setData({ students: [], owners: [], cases: [] });
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  // If redirected with ?studentId=..., open modal automatically when data arrives
  useEffect(() => {
    const studentIdParam = params.get("studentId");
    if (studentIdParam && data.students.length > 0 && !editing) {
      setEditing({
        userId: studentIdParam,
        ownerId: String(data.owners[0]?.id || ""),
        status: "open",
        note: "",
        outcome: "",
        followUpAt: "",
      });
    }
  }, [params, data.students, data.owners, editing]);

  // Save case handler (create or update)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing.note || editing.note.trim().length < 10) {
      return toast.error("Nội dung ghi chú cần ít nhất 10 ký tự.");
    }
    if (editing.status === "scheduled" && !editing.followUpAt) {
      return toast.error("Vui lòng chọn thời gian hẹn hỗ trợ.");
    }
    if (editing.status === "resolved" && (!editing.outcome || editing.outcome.trim().length < 10)) {
      return toast.error("Vui lòng ghi rõ kết quả hỗ trợ ít nhất 10 ký tự.");
    }

    setBusy(true);
    try {
      await saveSupportCase(editing.id, {
        ...editing,
        classId,
        userId: Number(editing.userId),
        ownerId: Number(editing.ownerId),
        note: editing.note.trim(),
        outcome: editing.outcome ? editing.outcome.trim() : "",
        followUpAt: editing.followUpAt ? new Date(editing.followUpAt).toISOString() : null,
      });

      setEditing(null);
      await load();
      toast.success(editing.id ? "Đã cập nhật hồ sơ hỗ trợ thành công." : "Đã tạo hồ sơ hỗ trợ mới thành công.");
    } catch (err) {
      toast.error(err.message || "Lỗi khi lưu hồ sơ hỗ trợ.");
    } finally {
      setBusy(false);
    }
  };

  // Filtered cases
  const filteredCases = useMemo(() => {
    let list = data.cases || [];
    if (status !== "all") {
      list = list.filter((c) => c.status === status);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          (c.student_name || "").toLowerCase().includes(q) ||
          (c.owner_name || "").toLowerCase().includes(q) ||
          (c.note || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [data.cases, status, searchQuery]);

  // Case counts
  const stats = useMemo(() => {
    let openCount = 0;
    let scheduledCount = 0;
    let contactedCount = 0;
    let resolvedCount = 0;
    for (const c of data.cases || []) {
      if (c.status === "open") openCount++;
      else if (c.status === "scheduled") scheduledCount++;
      else if (c.status === "contacted") contactedCount++;
      else if (c.status === "resolved") resolvedCount++;
    }
    return {
      total: data.cases?.length || 0,
      openCount,
      scheduledCount,
      contactedCount,
      resolvedCount,
    };
  }, [data.cases]);

  const activeClass = classes.find((c) => String(c.id) === String(classId));

  return (
    <div className="min-h-full p-2.5 sm:p-4 lg:p-6 text-slate-900 transition-colors">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
        {/* ================= 1. CALLIGRAPHIC HEADER HERO TRỰC TIẾP TRÊN NỀN PHONG CẢNH Á ĐÔNG ================= */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1 pb-1">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/85 px-3 py-1 text-xs font-bold text-[#102f63] shadow-2xs backdrop-blur-md">
              <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
              <span>Cố vấn học tập & Chăm sóc học viên</span>
            </div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs">
              Theo Dõi & Hỗ Trợ Học Viên
            </h1>
            <p className="text-xs font-semibold italic text-slate-800 sm:text-sm">
              “Đồng hành cùng học viên vượt qua khó khăn, tối ưu hóa lộ trình bứt phá điểm số.”
            </p>
            <p className="font-['Ma_Shan_Zheng',cursive] text-xs sm:text-sm tracking-wider text-slate-600">
              —— 循循善诱，诲人不倦。
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={!data.students.length || loading}
              onClick={() =>
                setEditing({
                  userId: params.get("studentId") || String(data.students[0]?.id || ""),
                  ownerId: String(data.owners[0]?.id || ""),
                  status: "open",
                  note: "",
                  outcome: "",
                  followUpAt: "",
                })
              }
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#102f63] to-[#1d4f8d] px-4 py-2.5 text-xs font-black text-white shadow-[0_8px_20px_rgba(16,47,99,0.22)] transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo hồ sơ hỗ trợ mới</span>
            </button>
          </div>
        </div>

        {/* ================= 2. 4 THẺ THỐNG KÊ KÍNH MỜ (KPI STAT TILES) ================= */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Tổng hồ sơ lớp này",
              value: stats.total,
              subtext: activeClass ? activeClass.title : "Lớp đang chọn",
              icon: Users,
              iconStyle: "bg-blue-50 text-blue-600",
            },
            {
              label: "Cần liên hệ gấp",
              value: stats.openCount,
              subtext: "Chưa trao đổi can thiệp",
              icon: AlertTriangle,
              iconStyle: "bg-rose-50 text-rose-600",
            },
            {
              label: "Đã lên lịch hẹn",
              value: stats.scheduledCount,
              subtext: "Lịch hẹn cố vấn 1-1",
              icon: CalendarDays,
              iconStyle: "bg-violet-50 text-violet-600",
            },
            {
              label: "Đã giải quyết xong",
              value: stats.resolvedCount,
              subtext: "Tiến độ học tập đã cải thiện",
              icon: CheckCircle2,
              iconStyle: "bg-emerald-50 text-emerald-600",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-[0_8px_25px_rgba(32,78,120,0.06)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-sky-300"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconStyle} shadow-2xs`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-black text-[#102f63] leading-none font-mono">
                    {item.value}
                  </p>
                  <p className="text-xs font-bold text-slate-800 leading-tight mt-1 truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                    {item.subtext}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        {/* ================= 3. BỘ LỌC TÌM KIẾM KHOA HỌC ================= */}
        <section className="rounded-2xl border border-white/80 bg-white/92 p-3.5 sm:p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-2xs">
                <Filter className="h-4 w-4" />
              </span>
              <h2 className="text-xs font-black uppercase tracking-wider text-[#102f63]">
                Bộ lọc quản lý hỗ trợ
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-500 font-mono">
              Hiển thị {filteredCases.length}/{stats.total} hồ sơ
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* 1. Lớp học */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Lớp học giảng dạy:
              </label>
              <select
                aria-label="Chọn lớp"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setEditing(null);
                }}
                className="w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 outline-none shadow-2xs focus:border-blue-500 focus:bg-white"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Trạng thái */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Trạng thái hỗ trợ:
              </label>
              <select
                aria-label="Trạng thái hỗ trợ"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 outline-none shadow-2xs focus:border-blue-500 focus:bg-white"
              >
                <option value="all">Tất cả trạng thái ({stats.total})</option>
                <option value="open">Cần liên hệ ({stats.openCount})</option>
                <option value="contacted">Đã liên hệ ({stats.contactedCount})</option>
                <option value="scheduled">Đã hẹn hỗ trợ ({stats.scheduledCount})</option>
                <option value="resolved">Đã hoàn tất ({stats.resolvedCount})</option>
              </select>
            </div>

            {/* 3. Tìm kiếm theo tên học viên hoặc nội dung */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Tìm kiếm học viên / ghi chú:
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Tên học viên, người phụ trách, nội dung..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200/90 bg-white/95 py-2 pl-8 pr-3 text-xs font-semibold text-slate-800 outline-none shadow-2xs focus:border-blue-500 focus:bg-white"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ================= 4. DANH SÁCH HỒ SƠ HỖ TRỢ ================= */}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-semibold text-rose-700">
            {error}
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-xs text-slate-400">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="mt-2 font-bold text-slate-600">Đang đồng bộ hồ sơ hỗ trợ học viên...</p>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="rounded-3xl border border-white/80 bg-white/90 p-12 text-center shadow-sm backdrop-blur-md space-y-3">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="text-base font-black text-slate-800">Chưa có hồ sơ hỗ trợ nào</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Không có hồ sơ hỗ trợ nào khớp với bộ lọc hiện tại. Bấm nút dưới đây để tạo hồ sơ chăm sóc học viên.
            </p>
            {data.students.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    userId: String(data.students[0]?.id || ""),
                    ownerId: String(data.owners[0]?.id || ""),
                    status: "open",
                    note: "",
                    outcome: "",
                    followUpAt: "",
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Tạo hồ sơ hỗ trợ</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredCases.map((c) => {
              const state = statesConfig[c.status] || statesConfig.open;
              const isOverdue =
                c.status !== "resolved" &&
                c.follow_up_at &&
                new Date(c.follow_up_at).getTime() < Date.now();

              return (
                <article
                  key={c.id}
                  className="rounded-3xl border border-white/90 bg-white/95 p-4 sm:p-5 shadow-xs transition hover:border-sky-300 hover:shadow-md space-y-3"
                >
                  {/* Top row: Học viên + Trạng thái + Nút cập nhật */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 font-black text-sm border border-sky-100 shadow-2xs">
                        {(c.student_name || "HV").slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-slate-900">
                            {c.student_name}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${state.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
                            {state.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <User className="h-3 w-3 text-slate-400" />
                          <span>Giảng viên phụ trách: <strong>{c.owner_name}</strong></span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          userId: String(c.user_id),
                          ownerId: String(c.owner_id),
                          status: c.status,
                          note: c.note,
                          outcome: c.outcome || "",
                          followUpAt: datetimeLocal(c.follow_up_at),
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Cập nhật hồ sơ</span>
                    </button>
                  </div>

                  {/* Nội dung ghi chú & kế hoạch */}
                  <div className="rounded-2xl bg-slate-50/70 border border-slate-100 p-3 text-xs text-slate-700 space-y-1">
                    <p className="font-bold text-[#102f63] flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                      Nội dung liên hệ & Kế hoạch can thiệp:
                    </p>
                    <p className="text-slate-600 whitespace-pre-wrap leading-relaxed pl-5">
                      {c.note}
                    </p>
                  </div>

                  {/* Lịch hẹn & Kết quả */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                    <div className="flex flex-wrap items-center gap-3">
                      {c.follow_up_at && (
                        <div
                          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-bold ${
                            isOverdue
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            {isOverdue ? "Đã quá hạn hẹn: " : "Lịch hẹn hỗ trợ: "}
                            {new Date(c.follow_up_at).toLocaleString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      )}

                      {c.outcome && (
                        <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Kết quả: {c.outcome}</span>
                        </div>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-400 font-medium">
                      Cập nhật: {new Date(c.updated_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= MODAL: TẠO & CẬP NHẬT HỒ SƠ HỖ TRỢ ================= */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f63]/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-white/90 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                  <Pencil className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#102f63]">
                    {editing.id ? "Cập nhật hồ sơ hỗ trợ" : "Tạo hồ sơ hỗ trợ học viên mới"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ghi nhận tình hình, lịch hẹn và phương án bồi dưỡng học viên
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Chọn Học viên */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Học viên cần hỗ trợ *
                </label>
                <select
                  required
                  disabled={Boolean(editing.id)}
                  value={editing.userId}
                  onChange={(e) => setEditing({ ...editing, userId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white disabled:opacity-60"
                >
                  {data.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Người phụ trách & Trạng thái */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Người phụ trách can thiệp *
                  </label>
                  <select
                    required
                    value={editing.ownerId}
                    onChange={(e) => setEditing({ ...editing, ownerId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                  >
                    {data.owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Trạng thái hiện tại *
                  </label>
                  <select
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="open">Cần liên hệ</option>
                    <option value="contacted">Đã liên hệ</option>
                    <option value="scheduled">Đã hẹn hỗ trợ</option>
                    <option value="resolved">Đã hoàn tất</option>
                  </select>
                </div>
              </div>

              {/* Lịch hẹn / Lần theo dõi tiếp theo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lịch hẹn / Lần can thiệp kế tiếp {editing.status === "scheduled" && "*"}
                </label>
                <input
                  type="datetime-local"
                  required={editing.status === "scheduled"}
                  value={editing.followUpAt}
                  onChange={(e) => setEditing({ ...editing, followUpAt: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              {/* Nội dung ghi chú */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nội dung liên hệ & Kế hoạch can thiệp (tối thiểu 10 ký tự) *
                </label>
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={3}
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="Ghi nhận vấn đề học viên gặp phải (học lực, bài tập, nghỉ học nhiều) và phương án bồi dưỡng..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              {/* Kết quả hỗ trợ */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kết quả hỗ trợ {editing.status === "resolved" && "(Bắt buộc khi hoàn tất)*"}
                </label>
                <textarea
                  required={editing.status === "resolved"}
                  minLength={editing.status === "resolved" ? 10 : undefined}
                  maxLength={2000}
                  rows={2}
                  value={editing.outcome}
                  onChange={(e) => setEditing({ ...editing, outcome: e.target.value })}
                  placeholder="Ghi nhận kết quả sau khi hỗ trợ (học viên đã hiểu bài, cải thiện điểm số)..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-[#102f63] hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
                >
                  {busy ? "Đang lưu..." : "Lưu hồ sơ hỗ trợ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
