import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FolderOpen, Play, RefreshCw, Video } from "lucide-react";
import { fetchStudentRecordings } from "../../../api/lmsClient";
import RecordingCard from "../recordings/RecordingCard";

const timeValue = (value) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function ClassRecordingsCard({ classId, recordingMode = false }) {
  const [data, setData] = useState({ classes: [], recordings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecordings = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchStudentRecordings({ classId });
      const payload = response?.data;
      setData({
        classes: Array.isArray(payload?.classes) ? payload.classes : [],
        recordings: Array.isArray(payload?.recordings) ? payload.recordings : Array.isArray(payload) ? payload : [],
      });
    } catch (requestError) {
      setData({ classes: [], recordings: [] });
      setError(requestError.message || "Không thể tải bản ghi của lớp.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  const recordings = useMemo(() => (
    data.recordings
      .filter((item) => String(item.classId) === String(classId))
      .sort((left, right) => timeValue(right.recordedAt) - timeValue(left.recordedAt))
  ), [classId, data.recordings]);
  const classInfo = data.classes.find((item) => String(item.id) === String(classId));
  const folderUrl = classInfo?.folderOpenUrl || classInfo?.folderUrl || null;

  return (
    <section className={`rounded-3xl border p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6 dark:border-slate-800 dark:shadow-none ${
      recordingMode
        ? "border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white/95 to-sky-50/80 dark:bg-slate-900/90"
        : "border-white/80 bg-white/90 dark:bg-slate-900/90"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-md ${recordingMode ? "bg-amber-500" : "bg-sky-600"}`}>
            <Video className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-[#102f63] dark:text-white">
                {recordingMode ? "Bản ghi dành cho bạn" : "Bản ghi mới nhất"}
              </h2>
              {recordingMode && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800">
                  Ưu tiên học qua video
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[#487291] dark:text-slate-400">
              {recordingMode
                ? "Bản ghi được cập nhật từ lớp chính; bài tập và quiz vẫn nộp về giáo viên phụ trách."
                : "Xem lại nội dung đã học theo từng buổi."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {folderUrl && (
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white/90 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:text-sky-300"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Thư mục lớp
            </a>
          )}
          <Link
            to="/lms/recordings"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#102f63] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-800 dark:bg-sky-700 dark:hover:bg-sky-600"
          >
            Tất cả bản ghi <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-sky-200 bg-white/60 p-7 text-center text-xs font-semibold text-sky-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-sky-300">
          Đang tải bản ghi mới nhất...
        </div>
      ) : error ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
          <span>{error}</span>
          <button type="button" onClick={loadRecordings} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Thử lại
          </button>
        </div>
      ) : recordings.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-white/60 p-7 text-center dark:border-slate-800 dark:bg-slate-800/40">
          <Play className="mx-auto h-7 w-7 text-amber-500" />
          <p className="mt-2 text-sm font-bold text-[#102f63] dark:text-white">Chưa có bản ghi được phát hành</p>
          <p className="mt-1 text-xs text-[#487291] dark:text-slate-400">Video sẽ xuất hiện tại đây sau khi giáo viên hoặc admin công bố.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {recordings.slice(0, 4).map((item) => (
            <RecordingCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
