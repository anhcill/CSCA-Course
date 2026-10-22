
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Send,
  Sliders,
  Unlock,
} from "lucide-react";
import {
  fetchGradebook,
  saveGradebookPolicy,
  finalizeGradebook,
  reopenGradebook,
  reportGradebookToAdmin,
} from "../../api/lmsClient";

export default function GradebookPolicyPanel({ classId, sessionId, search = "" }) {
  const [book, setBook] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [policyExpanded, setPolicyExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetchGradebook(classId, sessionId);
      setBook(r.data);
      setPolicy(r.data.policy);
    } catch (e) {
      setError(e.message);
      setBook(null);
    }
  }, [classId, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdateAndReport = async () => {
    setReporting(true);
    try {
      const res = await reportGradebookToAdmin(classId);
      await load();
      toast.success(res?.message || "Đã cập nhật điểm và gửi báo cáo về Ban Quản Trị thành công! 🌟");
    } catch (e) {
      toast.error(e.message || "Không thể cập nhật và gửi báo cáo điểm.");
    } finally {
      setReporting(false);
    }
  };

  const act = async (action) => {
    if (
      (action === "save" && !book?.capabilities?.canManagePolicy) ||
      (action === "finalize" && !book?.capabilities?.canFinalize) ||
      (action === "reopen" && !book?.capabilities?.canReopen)
    )
      return;

    setBusy(true);
    try {
      if (action === "save") await saveGradebookPolicy(classId, policy);
      else if (action === "finalize") await finalizeGradebook(classId);
      else await reopenGradebook(classId, reason);
      setConfirm("");
      setReason("");
      await load();
      toast.success("Đã cập nhật sổ điểm tổng kết thành công.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5 text-xs text-rose-700 shadow-sm backdrop-blur-md">
        <p role="alert" className="font-bold">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded-xl bg-white px-3 py-1.5 font-bold shadow-2xs hover:bg-rose-100"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!book || !policy) {
    return (
      <div className="rounded-3xl border border-white/80 bg-white/85 p-6 text-center text-xs font-semibold text-slate-500 shadow-sm backdrop-blur-md">
        Đang tính toán bảng điểm tổng kết theo trọng số...
      </div>
    );
  }

  const filtered = (book.rows || []).filter((r) =>
    (r.name + " " + r.email).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  const dirty = JSON.stringify(policy) !== JSON.stringify(book.policy);
  const { canManagePolicy = false, canFinalize = false, canReopen = false } = book.capabilities || {};

  return (
    <section className="rounded-3xl border border-white/80 bg-white/92 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-4">

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-300 shadow-2xs">
              <Award className="h-4 w-4" />
            </span>
            <h2 className="text-base font-black text-[#102f63] dark:text-white">
              Điểm Tổng Kết Theo Trọng Số Khóa Học
            </h2>
            {book.lastReport && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Đã báo cáo Admin
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {book.finalization
              ? `Sổ điểm đã chốt lúc ${new Date(book.finalization.finalizedAt).toLocaleString("vi-VN")}.`
              : "Điểm đang ở chế độ tạm tính; vui lòng lưu quy tắc trọng số trước khi chốt."}
            {sessionId !== "all" && " · Đang xem riêng buổi học được chọn."}
            {book.lastReport && ` · Lần báo cáo: ${new Date(book.lastReport.created_at).toLocaleString("vi-VN")}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || reporting}
            onClick={handleUpdateAndReport}
            title="Tính toán lại toàn bộ điểm học viên và gửi báo cáo về trung tâm Admin"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
          >
            {reporting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Đang gửi báo cáo Admin...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" /> Cập nhật & báo cáo điểm
              </>
            )}
          </button>
        </div>
      </div>

      {/* Accordion: Quy tắc tính điểm & Trọng số */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-800/50 overflow-hidden">
        <button
          type="button"
          onClick={() => setPolicyExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-[#102f63] dark:text-sky-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          <span className="flex items-center gap-2">
            <Sliders className="h-3.5 w-3.5 text-blue-600" />
            Cấu hình Trọng số & Quy tắc tính điểm ({policy.weights.assignment}% Bài tập, {policy.weights.quiz}% Quiz, {policy.weights.attendance}% Chuyên cần)
          </span>
          {policyExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {policyExpanded && (
          <div className="p-4 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <fieldset
              disabled={busy || Boolean(book.finalization) || !canManagePolicy}
              className="grid gap-3 sm:grid-cols-3 text-xs"
            >
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Trọng số Bài tập (%):</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-900 dark:text-white"
                  value={policy.weights.assignment}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      weights: { ...policy.weights, assignment: Number(e.target.value) },
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Trọng số Quiz trắc nghiệm (%):</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-900 dark:text-white"
                  value={policy.weights.quiz}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      weights: { ...policy.weights, quiz: Number(e.target.value) },
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Trọng số Chuyên cần (%):</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-900 dark:text-white"
                  value={policy.weights.attendance}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      weights: { ...policy.weights, attendance: Number(e.target.value) },
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Quiz nhiều lượt làm:</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-800 outline-none shadow-2xs dark:bg-slate-900 dark:text-white"
                  value={policy.quizStrategy}
                  onChange={(e) => setPolicy({ ...policy, quizStrategy: e.target.value })}
                >
                  <option value="latest">Lấy lượt làm cuối cùng</option>
                  <option value="best">Lấy điểm cao nhất</option>
                  <option value="average">Trung bình các lượt</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Bài chưa có điểm:</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-800 outline-none shadow-2xs dark:bg-slate-900 dark:text-white"
                  value={policy.missingPolicy}
                  onChange={(e) => setPolicy({ ...policy, missingPolicy: e.target.value })}
                >
                  <option value="exclude">Tạm thời bỏ qua (tính theo bài đã có)</option>
                  <option value="zero">Quy về 0 điểm</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Ngưỡng đạt tiêu chuẩn (%):</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-900 dark:text-white"
                  value={policy.passMark}
                  onChange={(e) => setPolicy({ ...policy, passMark: Number(e.target.value) })}
                />
              </div>
            </fieldset>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              * Tổng trọng số phải bằng 100%. Nhóm không có hoạt động được tự động bỏ qua; buổi vắng có phép không trừ điểm chuyên cần.
            </p>

            {canManagePolicy && !book.finalization && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={() => act("save")}
                  className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
                >
                  {dirty ? "Lưu quy tắc mới" : "Đã lưu quy tắc"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bảng danh sách kết quả học viên */}
      <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#edf6fd]/80 dark:bg-slate-800/80 border-b border-sky-100 dark:border-slate-700 text-[11px] font-black uppercase text-[#102f63] dark:text-sky-200">
              <th className="py-2.5 px-3">Học viên</th>
              <th className="py-2.5 px-3">Điểm tổng kết (/100)</th>
              <th className="py-2.5 px-3 text-right">Đánh giá chung</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-slate-500">
                  Không tìm thấy học viên nào.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                    {r.name}
                    {r.email && <span className="block text-[10px] font-normal text-slate-400">{r.email}</span>}
                  </td>
                  <td className="py-2 px-3 font-mono font-black text-blue-700 dark:text-sky-300">
                    {r.total !== null && r.total !== undefined ? `${r.total}đ` : "Chưa có điểm"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                        r.passed === null
                          ? "bg-slate-100 text-slate-600"
                          : r.passed
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {r.passed === null ? "Chưa xác định" : r.passed ? "✓ Đạt chuẩn" : "✕ Chưa đạt"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Hành động Chốt sổ điểm & Mở lại */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {!book.finalization && canFinalize && (
            <button
              disabled={busy || dirty || sessionId !== "all"}
              onClick={() => setConfirm("finalize")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
            >
              <Lock className="h-3.5 w-3.5" /> Chốt điểm toàn lớp
            </button>
          )}

          {book.finalization && canReopen && (
            <button
              disabled={busy}
              onClick={() => setConfirm("reopen")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 shadow-2xs transition hover:bg-amber-100 disabled:opacity-40"
            >
              <Unlock className="h-3.5 w-3.5" /> Mở lại để điều chỉnh điểm
            </button>
          )}

          {!book.finalization && dirty && canFinalize && (
            <p className="text-xs font-semibold text-amber-600">
              * Bạn có thay đổi trọng số chưa lưu. Vui lòng lưu quy tắc trước khi chốt.
            </p>
          )}
        </div>

        {/* Lịch sử chốt sổ */}
        {book.history && book.history.length > 0 && (
          <button
            type="button"
            onClick={() => setHistoryExpanded((p) => !p)}
            className="text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1"
          >
            Lịch sử chốt ({book.history.length}) {historyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {historyExpanded && book.history && (
        <div className="rounded-2xl bg-slate-50 p-3 text-xs space-y-1.5 dark:bg-slate-800/60">
          {book.history.map((h) => (
            <p key={h.id} className="text-slate-600 dark:text-slate-300">
              #{h.id} · Chốt bởi <strong>{h.finalized_by_name}</strong> lúc {new Date(h.finalized_at).toLocaleString("vi-VN")}
              {h.reopened_at && ` · Mở lại: "${h.reopen_reason}"`}
            </p>
          ))}
        </div>
      )}

      {/* Confirmation form modal inline */}
      {confirm && (
        <form
          className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/60 dark:bg-amber-950/40 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(confirm);
          }}
        >
          <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
            {confirm === "finalize"
              ? "Bạn có chắc chắn muốn chốt bảng điểm hiện tại? Sau khi chốt, việc sửa đổi điểm cần lý do để mở lại."
              : "Vui lòng nhập lý do mở lại sổ điểm (bản chốt cũ vẫn được lưu vào lịch sử):"}
          </p>

          {confirm === "reopen" && (
            <textarea
              aria-label="Lý do mở sổ điểm"
              required
              minLength={10}
              maxLength={2000}
              placeholder="Nêu rõ lý do cần điều chỉnh điểm số..."
              className="w-full rounded-xl border border-amber-300 bg-white p-2.5 text-xs outline-none focus:border-amber-500 shadow-2xs dark:bg-slate-900"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-40"
            >
              {busy ? "Đang xử lý..." : "Xác nhận thực hiện"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              onClick={() => setConfirm("")}
            >
              Hủy
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
