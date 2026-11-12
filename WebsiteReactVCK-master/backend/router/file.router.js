import express from "express";
import multer from "multer";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
import { query } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  ALLOWED_LEARNING_FILE_MIME_TYPES,
  MAX_LEARNING_FILE_SIZE_BYTES,
  generateLearningFileUploadPresignedUrl,
  generateLearningFilePlaybackSignedUrl,
  generateLearningFileHeadSignedUrl,
  deleteLearningFileObject,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_FOLDERS,
  generateImageUploadPresignedUrl,
  generateImagePlaybackSignedUrl,
  generateImageHeadSignedUrl,
  validateImageR2Key,
  getR2PublicUrl,
} from "../services/video.service.js";
import { createCloudinaryUploadSignature } from "../services/cloudinary.service.js";
import { isVideoCourseUnitUnlocked } from "../services/videoCourseUnitAccess.service.js";

const router = express.Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
    }
    return callback(null, true);
  },
});

const acceptSingleImage = (req, res, next) => {
  imageUpload.single("image")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return errorResponse(res, 422, "Kích thước ảnh tối đa 10MB", "IMAGE_TOO_LARGE");
    }
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return errorResponse(res, 422, "Tệp ảnh không hợp lệ (hỗ trợ JPG, PNG, WEBP, GIF, SVG)", "VALIDATION_ERROR");
    }
    console.error("Error reading image upload:", error);
    return errorResponse(res, 400, "Không thể đọc tệp ảnh", "INVALID_UPLOAD");
  });
};

const errorResponse = (res, status, message, errorCode) => res.status(status).json({
  success: false, message, errorCode,
});

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const safeFilename = (value) => typeof value === "string" && value.trim() && value.trim().length <= 255;
const FILE_INSTANCES_CTE = `
  WITH file_instances AS (
    SELECT f.id AS file_id, NULL::bigint AS placement_id,
           f.live_class_id AS effective_live_class_id,
           f.class_session_id AS effective_class_session_id,
           f.visibility AS effective_visibility,
           f.created_at AS attached_at,
           f.*
    FROM lms_learning_files f
    UNION ALL
    SELECT f.id AS file_id, p.id AS placement_id,
           p.live_class_id AS effective_live_class_id,
           p.class_session_id AS effective_class_session_id,
           p.visibility AS effective_visibility,
           p.created_at AS attached_at,
           f.*
    FROM lms_learning_file_placements p
    JOIN lms_learning_files f ON f.id = p.file_id
  )`;
const INLINE_VIEW_MIME_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/csv",
  "text/plain",
]);
const isPdfFile = (file) => file?.mime_type === "application/pdf"
  || /\.pdf$/i.test(String(file?.original_name || ""));
const canDisplayInline = (file) => INLINE_VIEW_MIME_TYPES.has(file?.mime_type) || isPdfFile(file);

const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
}[character]));

const protectedPdfViewerHtml = ({ filename, signedUrl, fileSizeBytes = 0 }) => {
  let r2Origin = "";
  try {
    r2Origin = new URL(signedUrl).origin;
  } catch (_) {}
  const isSlide = /slide|bài giảng|bai giang|presentation|ppt/i.test(String(filename || ""));
  const docTypeLabel = isSlide ? "slide bài giảng" : "tài liệu";

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(filename)}</title>
  ${r2Origin ? `<link rel="dns-prefetch" href="${r2Origin}"><link rel="preconnect" href="${r2Origin}" crossorigin>` : ""}
  <style>
    *{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden;background:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    header{height:52px;display:flex;align-items:center;gap:12px;padding:0 16px;background:#0f172a;color:#fff;border-bottom:1px solid #334155}
    strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.badge{flex:none;border:1px solid #38bdf8;border-radius:999px;padding:4px 8px;color:#7dd3fc;font-size:10px;font-weight:800;letter-spacing:.08em}
    .controls{margin-left:auto;display:flex;align-items:center;gap:7px}.zoom-value{min-width:48px;text-align:center;color:#cbd5e1;font-size:12px;font-weight:800}
    button{flex:none;border:1px solid #475569;border-radius:9px;background:#1e293b;color:#e2e8f0;padding:7px 12px;font-weight:800;cursor:pointer}button:hover{background:#334155}.zoom-button{width:34px;padding:7px 0;font-size:18px;line-height:1}.close-button{margin-left:5px}
    main{position:fixed;inset:52px 0 0;overflow:hidden;background:#0f172a}
    iframe{position:absolute;top:-56px;left:0;width:100%;height:calc(100% + 56px);border:0;background:#0f172a;transform-origin:top left;transition:transform .15s ease}
    body.is-embedded header{display:none}body.is-embedded main{inset:0}
    #loader{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f172a;color:#fff;z-index:20;transition:opacity .45s cubic-bezier(0.16,1,0.3,1),visibility .45s cubic-bezier(0.16,1,0.3,1);padding:24px}
    .loader-card{display:flex;flex-direction:column;align-items:center;background:rgba(30,41,59,.92);border:1px solid rgba(71,85,105,.55);border-radius:24px;padding:32px 36px;box-shadow:0 24px 48px -12px rgba(0,0,0,.65);backdrop-filter:blur(14px);max-width:400px;width:100%;text-align:center}
    .spinner{width:48px;height:48px;border:3px solid rgba(56,189,248,.18);border-top-color:#38bdf8;border-radius:50%;animation:spin .85s linear infinite;margin-bottom:18px;transition:border-color .3s}
    .spinner.rendering{border-top-color:#a855f7;border-right-color:#38bdf8;animation:spin .65s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .loader-title{font-size:15px;font-weight:800;color:#f8fafc;letter-spacing:-.01em;margin-bottom:6px;transition:color .2s}
    .loader-desc{font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:16px;min-height:36px;display:flex;align-items:center;justify-content:center}
    .loader-progress-wrap{width:100%;margin-top:4px}
    .loader-bar{width:100%;height:7px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;position:relative}
    .loader-bar-fill{position:absolute;top:0;left:0;height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#818cf8);border-radius:99px;transition:width .2s ease,background .3s}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    .loader-bar-fill.rendering{background:linear-gradient(90deg,#38bdf8 0%,#c084fc 50%,#38bdf8 100%);background-size:200% 100%;animation:shimmer 1.5s infinite linear}
    .loader-bar-fill.done{background:linear-gradient(90deg,#10b981,#059669)}
    .loader-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:#cbd5e1;margin-top:8px}
    .loader-percent{color:#38bdf8;font-family:monospace;font-size:13px}
    .loader-bytes{color:#64748b;font-family:monospace;font-size:11px}
    .render-tag{display:none;align-items:center;gap:6px;margin-top:12px;padding:4px 12px;border-radius:999px;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);color:#c084fc;font-size:11px;font-weight:700}
    .pulse-dot{width:6px;height:6px;border-radius:50%;background:#c084fc;box-shadow:0 0 8px #c084fc;animation:pulseDot 1s infinite alternate}
    @keyframes pulseDot{0%{transform:scale(0.8);opacity:.5}100%{transform:scale(1.25);opacity:1}}
    .reload-hint{margin-top:16px;font-size:11px;color:#64748b;display:none}
    .reload-btn{background:#1e293b;border:1px solid #475569;border-radius:8px;color:#93c5fd;font-size:11px;font-weight:700;padding:6px 14px;cursor:pointer;margin-top:8px;display:none}
    .reload-btn:hover{background:#334155}
  </style>
</head>
<body>
  <header>
    <span class="badge">CHỈ XEM</span><strong>${escapeHtml(filename)}</strong>
    <div class="controls">
      <button class="zoom-button" type="button" title="Thu nhỏ PDF" aria-label="Thu nhỏ PDF" onclick="changeZoom(-10)">−</button>
      <span class="zoom-value" id="zoom-value">100%</span>
      <button class="zoom-button" type="button" title="Phóng to PDF" aria-label="Phóng to PDF" onclick="changeZoom(10)">+</button>
      <button class="close-button" type="button" onclick="history.length > 1 ? history.back() : window.close()">Đóng</button>
    </div>
  </header>
  <main>
    <div id="loader">
      <div class="loader-card">
        <div id="spinner" class="spinner"></div>
        <div id="loader-title" class="loader-title">Đang nạp ${docTypeLabel}...</div>
        <div id="loader-desc" class="loader-desc">Vui lòng chờ tiến trình nạp hoàn tất để xem nội dung mượt mà.</div>
        <div class="loader-progress-wrap">
          <div class="loader-bar"><div id="loader-bar-fill" class="loader-bar-fill"></div></div>
          <div class="loader-meta">
            <span id="loader-percent" class="loader-percent">0%</span>
            <span id="loader-bytes" class="loader-bytes">Đang kết nối...</span>
          </div>
        </div>
        <div id="render-tag" class="render-tag">
          <span class="pulse-dot"></span>
          <span id="render-tag-text">Đang dựng hình ảnh...</span>
        </div>
        <div id="reload-hint" class="reload-hint">Nếu nạp quá lâu, bạn có thể thử làm mới:</div>
        <button id="reload-btn" class="reload-btn" type="button" onclick="location.reload()">Nhấn để làm mới</button>
      </div>
    </div>
    <iframe id="pdf-frame" title="${escapeHtml(filename)}" data-src="${escapeHtml(`${signedUrl}#toolbar=0&navpanes=0&scrollbar=1&zoom=100`)}" src="about:blank" loading="eager"></iframe>
  </main>
  <script>
    window.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });
    try {
      if (window.self !== window.top) {
        document.body.classList.add('is-embedded');
      }
    } catch (_) {}
    const signedUrl = "${signedUrl.replace(/"/g, '\\"')}";
    const knownTotalBytes = ${Number(fileSizeBytes || 0)};
    const isSlideFile = ${isSlide};
    const docLabel = "${docTypeLabel}";
    const frame = document.getElementById('pdf-frame');
    const loader = document.getElementById('loader');
    const spinner = document.getElementById('spinner');
    const titleEl = document.getElementById('loader-title');
    const descEl = document.getElementById('loader-desc');
    const percentEl = document.getElementById('loader-percent');
    const bytesEl = document.getElementById('loader-bytes');
    const barFill = document.getElementById('loader-bar-fill');
    const renderTag = document.getElementById('render-tag');
    const renderTagText = document.getElementById('render-tag-text');
    const reloadHint = document.getElementById('reload-hint');
    const reloadBtn = document.getElementById('reload-btn');

    let isFinished = false;
    let renderPhaseStarted = false;
    let renderStartTime = 0;

    function formatBytes(bytes) {
      if (!bytes || bytes <= 0) return '';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function setProgress(percent, loadedStr, totalStr) {
      if (percentEl) percentEl.textContent = percent + '%';
      if (bytesEl && loadedStr) bytesEl.textContent = loadedStr + (totalStr ? ' / ' + totalStr : '');
      if (barFill) barFill.style.width = percent + '%';
    }

    function hideLoader() {
      if (isFinished) return;
      isFinished = true;
      if (loader) {
        loader.style.opacity = '0';
        loader.style.pointerEvents = 'none';
        setTimeout(function() { loader.style.display = 'none'; }, 480);
      }
    }

    // Phase 2: Enter Rendering phase (Download completed, now waiting for browser/PDFium to paint the slide)
    function enterRenderingPhase(totalBytes) {
      if (renderPhaseStarted) return;
      renderPhaseStarted = true;
      renderStartTime = Date.now();

      const totalMb = (totalBytes || knownTotalBytes || 0) / (1024 * 1024);
      const isHeavy = totalMb >= 10;

      // Update UI to clearly communicate that downloading is 100% complete,
      // and the browser engine is now decoding & rendering the slides to avoid black screen confusion.
      setProgress(100, formatBytes(totalBytes || knownTotalBytes), formatBytes(totalBytes || knownTotalBytes));
      if (titleEl) {
        titleEl.textContent = isSlideFile
          ? 'Đang kết xuất và hiển thị slide...'
          : 'Đang kết xuất tài liệu...';
      }
      if (descEl) {
        descEl.textContent = isHeavy
          ? 'Tải xong dữ liệu (' + totalMb.toFixed(1) + ' MB). Đang giải mã trang slide chất lượng cao, vui lòng đợi giây lát...'
          : 'Tải xong dữ liệu. Trình duyệt đang giải mã trang để hiển thị lên màn hình...';
      }
      if (spinner) spinner.classList.add('rendering');
      if (barFill) barFill.classList.add('rendering');
      if (renderTag) {
        renderTag.style.display = 'inline-flex';
        if (renderTagText) {
          renderTagText.textContent = isSlideFile
            ? 'Đang dựng trang slide...'
            : 'Đang khởi tạo trang...';
        }
      }
      if (bytesEl) {
        bytesEl.textContent = 'Hoàn tất tải về • Đang mở trang...';
      }

      // Calculate safe render wait time based on file size:
      // Heavy slides take 2.2 - 3.8s in Chromium PDFium to parse font/vectors and paint page 1
      const safeWaitMs = Math.max(1800, Math.min(4200, Math.round(totalMb * 90) + 1400));
      const minSafeWaitMs = Math.max(1300, Math.min(2600, Math.round(totalMb * 50) + 1000));

      let completeTimer = null;

      function scheduleCompletion(extraBufferMs) {
        if (isFinished) return;
        if (completeTimer) clearTimeout(completeTimer);
        const elapsed = Date.now() - renderStartTime;
        const requiredWait = Math.max(minSafeWaitMs, (extraBufferMs || 0) + elapsed);
        const waitRemaining = Math.max(300, requiredWait - elapsed);

        completeTimer = setTimeout(function() {
          if (isFinished) return;
          if (titleEl) titleEl.textContent = isSlideFile ? 'Slide đã sẵn sàng!' : 'Tài liệu đã sẵn sàng!';
          if (descEl) descEl.textContent = 'Đang mở trang hiển thị...';
          if (bytesEl) bytesEl.textContent = '✓ Hoàn tất 100%';
          if (barFill) {
            barFill.classList.remove('rendering');
            barFill.classList.add('done');
          }
          if (renderTagText) renderTagText.textContent = '✓ Đã hiển thị';
          setTimeout(hideLoader, 350);
        }, waitRemaining);
      }

      // Signal 1: Listen for postMessage from Chromium PDF Viewer (e.g. 'documentLoaded', 'loadProgress')
      function onPdfMessage(evt) {
        try {
          const d = evt.data;
          if (d && (d.type === 'documentLoaded' || d === 'documentLoaded' || (d.type === 'loadProgress' && d.progress === 100))) {
            window.removeEventListener('message', onPdfMessage);
            scheduleCompletion(500); // 500ms buffer for GPU rasterization / canvas paint
          }
        } catch (_) {}
      }
      window.addEventListener('message', onPdfMessage);

      // Signal 2: DOM / Canvas detection for same-origin or Firefox PDF.js viewers
      let pollCount = 0;
      const pollInterval = setInterval(function() {
        if (isFinished) { clearInterval(pollInterval); return; }
        pollCount++;
        try {
          const doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
          if (doc && doc.querySelector('.page[data-loaded="true"], canvas, embed, .pdfViewer')) {
            clearInterval(pollInterval);
            window.removeEventListener('message', onPdfMessage);
            scheduleCompletion(400);
            return;
          }
        } catch (_) {}
        if (pollCount > 50) clearInterval(pollInterval);
      }, 100);

      // Signal 3: Fallback timer guarantees it will reveal smoothly even if events don't fire
      setTimeout(function() {
        if (!isFinished) {
          scheduleCompletion(0);
        }
      }, safeWaitMs);
    }

    const isVeryLargeFile = knownTotalBytes > 60 * 1024 * 1024; // > 60 MB

    if (isVeryLargeFile) {
      if (titleEl) titleEl.textContent = 'Đang nạp ' + docLabel + ' dung lượng lớn...';
      const sizeStr = formatBytes(knownTotalBytes);
      setProgress(10, '0 MB', sizeStr);
      const fallbackUrl = frame.getAttribute('data-src') || signedUrl;
      frame.src = fallbackUrl;

      frame.addEventListener('load', function() {
        enterRenderingPhase(knownTotalBytes);
      });

      let currentProgress = 10;
      const simTimer = setInterval(function() {
        if (renderPhaseStarted || isFinished) { clearInterval(simTimer); return; }
        if (currentProgress < 95) {
          currentProgress += 5;
          const currentMb = formatBytes(Math.round((currentProgress / 100) * knownTotalBytes));
          setProgress(currentProgress, currentMb, sizeStr);
        }
      }, 700);
    } else {
      async function streamPdf() {
        try {
          const res = await fetch(signedUrl);
          if (!res.ok) throw new Error('Fetch failed: ' + res.status);
          const headerLen = res.headers.get('content-length');
          const total = knownTotalBytes || (headerLen ? parseInt(headerLen, 10) : 0);
          const totalStr = formatBytes(total);

          if (!res.body || !res.body.getReader) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            frame.src = blobUrl + '#toolbar=0&navpanes=0&scrollbar=1&zoom=100';
            enterRenderingPhase(total);
            return;
          }

          const reader = res.body.getReader();
          const chunks = [];
          let loadedBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loadedBytes += value.length;
            if (total > 0) {
              const percent = Math.min(99, Math.round((loadedBytes / total) * 100));
              setProgress(percent, formatBytes(loadedBytes), totalStr);
            } else {
              setProgress(50, formatBytes(loadedBytes), '');
            }
          }

          const blob = new Blob(chunks, { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          frame.src = blobUrl + '#toolbar=0&navpanes=0&scrollbar=1&zoom=100';
          enterRenderingPhase(loadedBytes || total);
        } catch (err) {
          console.warn('Progress load fallback:', err);
          const fallbackUrl = frame.getAttribute('data-src') || signedUrl;
          frame.src = fallbackUrl;
          enterRenderingPhase(knownTotalBytes);
        }
      }

      streamPdf();
    }

    setTimeout(function() {
      if (!isFinished && reloadHint && reloadBtn) {
        reloadHint.style.display = 'block';
        reloadBtn.style.display = 'inline-block';
      }
    }, 15000);

    let zoom = 100;
    function changeZoom(delta) {
      zoom = Math.max(30, Math.min(250, zoom + delta));
      document.getElementById('zoom-value').textContent = zoom + '%';
      const scale = zoom / 100;
      frame.style.top = (-56 * scale) + 'px';
      frame.style.width = (100 / scale) + '%';
      frame.style.height = 'calc(' + (100 / scale) + '% + 56px)';
      frame.style.transform = 'scale(' + scale + ')';
    }
  </script>
</body>
</html>`;
};

const classAccess = async (classId, user) => {
  const result = await query(
    `SELECT lc.id, lc.course_id, lc.instructor_id, lc.title, lc.allow_file_download,
            COALESCE(c.title, c.name) AS course_title
     FROM live_classes lc LEFT JOIN courses c ON c.id = lc.course_id
     WHERE lc.id = $1 AND lc.status <> 'cancelled'`,
    [classId],
  );
  const liveClass = result.rows[0];
  if (!liveClass) return { error: "not_found" };
  if (user.role === "admin") return { liveClass, canManage: true };
  if (user.role === "creator") {
    const teacher = await query(
      `SELECT 1 FROM class_teachers
       WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'
       UNION ALL
       SELECT 1 WHERE $3::bigint = $2
         AND NOT EXISTS (SELECT 1 FROM class_teachers
                         WHERE live_class_id = $1 AND teacher_id = $2 AND status <> 'active')
       LIMIT 1`,
      [liveClass.id, user.id, liveClass.instructor_id],
    );
    if (teacher.rows.length > 0) return { liveClass, canManage: true };
  }
  if (user.role !== "user") return { error: "forbidden" };
  const access = await query(
    `SELECT 1
     FROM class_enrollments ce
     WHERE ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
       AND EXISTS (
         SELECT 1 FROM lms_access_grants g
         WHERE g.course_id = $3 AND g.user_id = $2 AND g.access_status = 'active'
           AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
       )`,
    [classId, user.id, liveClass.course_id],
  );
  return access.rows.length ? { liveClass, canManage: false } : { error: "forbidden" };
};

// Course-scoped files are used for shared course material and quiz papers.
// A teacher may manage them when they own the course or teach an active class of it.
const courseAccess = async (courseId, user) => {
  const result = await query(
    `SELECT c.id, c.author_id
     FROM courses c WHERE c.id = $1`,
    [courseId],
  );
  const course = result.rows[0];
  if (!course) return { error: "not_found" };
  if (user.role === "admin" || String(course.author_id) === String(user.id)) return { course, canManage: true };
  if (user.role === "creator") {
    const teacher = await query(
      `SELECT 1
       FROM live_classes lc
       LEFT JOIN class_teachers ct ON ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
       WHERE lc.course_id = $1 AND lc.status = 'active'
         AND (ct.teacher_id IS NOT NULL OR (lc.instructor_id = $2
           AND NOT EXISTS (SELECT 1 FROM class_teachers revoked
                           WHERE revoked.live_class_id = lc.id AND revoked.teacher_id = $2
                             AND revoked.status <> 'active')))
       LIMIT 1`,
      [courseId, user.id],
    );
    if (teacher.rows.length > 0) return { course, canManage: true };
  }
  return { error: "forbidden" };
};

const fileAccess = async (fileId, user, requestedClassId = null) => {
  const result = await query(
    `SELECT f.*, lc.instructor_id, lc.course_id AS class_course_id,
            COALESCE(lc.allow_file_download, TRUE) AS allow_file_download,
            course_scope.id AS scoped_course_id
     FROM lms_learning_files f
     LEFT JOIN live_classes lc ON lc.id = f.live_class_id
     LEFT JOIN courses course_scope ON course_scope.id = COALESCE(f.course_id, lc.course_id)
     WHERE f.id = $1 AND f.status = 'ready'`,
    [fileId],
  );
  const sourceFile = result.rows[0];
  if (!sourceFile) return { error: "not_found" };
  const placement = requestedClassId ? (await query(
    `SELECT p.id, p.live_class_id, p.class_session_id, p.visibility,
            lc.course_id AS placement_course_id, lc.instructor_id,
            COALESCE(lc.allow_file_download, TRUE) AS allow_file_download
     FROM lms_learning_file_placements p
     JOIN live_classes lc ON lc.id = p.live_class_id
     WHERE p.file_id = $1 AND p.live_class_id = $2 AND lc.status = 'active'
     ORDER BY p.class_session_id NULLS FIRST, p.id
     LIMIT 1`,
    [fileId, requestedClassId],
  )).rows[0] : null;
  const file = placement ? {
    ...sourceFile,
    live_class_id: placement.live_class_id,
    class_session_id: placement.class_session_id,
    class_course_id: placement.placement_course_id,
    visibility: placement.visibility,
    allow_file_download: placement.allow_file_download,
    placement_id: placement.id,
  } : sourceFile;
  if (requestedClassId
      && String(sourceFile.live_class_id || "") !== String(requestedClassId)
      && !placement
      && sourceFile.visibility !== "COURSE") {
    return { error: "forbidden" };
  }
  if (user.role === "admin") return { file };
  if (user.role === "creator") {
    const scope = file.live_class_id ? await classAccess(file.live_class_id, user) : await courseAccess(file.course_id, user);
    if (scope.error || !scope.canManage) return { error: "forbidden" };
    if (!placement && file.visibility === "PRIVATE" && String(file.uploaded_by) !== String(user.id)) return { error: "forbidden" };
    return { file };
  }
  if (user.role !== "user") return { error: "forbidden" };
  if (file.visibility === "PRIVATE") return { error: "forbidden" };
  const access = await query(
    `SELECT 1 FROM lms_access_grants g
     WHERE g.course_id = $3 AND g.user_id = $2 AND g.access_status = 'active'
       AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
       AND ($4 = 'COURSE' OR ($4 = 'CLASS_ONLY' AND $1::bigint IS NOT NULL
         AND EXISTS (SELECT 1 FROM live_classes lc
                     JOIN class_enrollments ce ON ce.live_class_id = lc.id
                     WHERE lc.id = $1 AND lc.status = 'active'
                       AND ce.user_id = $2 AND ce.status = 'active')))
     LIMIT 1`,
    [file.live_class_id, user.id, file.live_class_id ? file.class_course_id : file.course_id, file.visibility],
  );
  if (!access.rows.length) {
    const preview = await query(
      `SELECT 1
       WHERE EXISTS (
         SELECT 1
         FROM lms_learning_files direct_file
         JOIN class_sessions cs ON cs.id = direct_file.class_session_id
         WHERE direct_file.id = $1 AND cs.is_public_preview = TRUE
           AND ($2::bigint IS NULL OR cs.live_class_id = $2)
       ) OR EXISTS (
         SELECT 1
         FROM lms_learning_file_placements p
         JOIN class_sessions cs ON cs.id = p.class_session_id
         WHERE p.file_id = $1 AND cs.is_public_preview = TRUE
           AND ($2::bigint IS NULL OR cs.live_class_id = $2)
       ) OR EXISTS (
         SELECT 1
         FROM lesson_learning_file_placements p
         JOIN lessons l ON l.id = p.lesson_id
         WHERE p.file_id = $1 AND l.is_public_preview = TRUE AND l.is_published = TRUE
       ) OR EXISTS (
         SELECT 1
         FROM quizzes q
         LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
         LEFT JOIN lessons l ON l.id = q.lesson_id
         WHERE (q.paper_file_id = $1 OR q.solution_file_id = $1)
           AND q.status = 'PUBLISHED'
           AND (COALESCE(cs.is_public_preview, FALSE) = TRUE
             OR COALESCE(l.is_public_preview, FALSE) = TRUE)
       )`,
      [fileId, requestedClassId],
    );
    if (!preview.rows.length) return { error: "forbidden" };
    return { file, canDownload: false, isPublicPreview: true };
  }

  if (file.visibility === "CLASS_ONLY" && file.live_class_id) {
    return { file, canDownload: file.allow_file_download !== false };
  }

  const policyCourseId = file.course_id || file.class_course_id;
  const policyParams = [user.id, policyCourseId];
  const requestedClassFilter = requestedClassId ? "AND lc.id = $3" : "";
  if (requestedClassId) policyParams.push(requestedClassId);
  const policies = await query(
    `SELECT lc.allow_file_download
     FROM live_classes lc
     JOIN class_enrollments ce ON ce.live_class_id = lc.id
     WHERE ce.user_id = $1 AND ce.status = 'active'
       AND lc.course_id = $2 AND lc.status = 'active'
       ${requestedClassFilter}`,
    policyParams,
  );
  if (requestedClassId && policies.rows.length === 0) return { error: "forbidden" };
  const canDownload = policies.rows.length === 0
    || policies.rows.every((row) => row.allow_file_download !== false);
  return { file, canDownload };
};

const serializeFile = (row, { enforceDownloadPolicy = false, contextClassId = null } = {}) => {
  const canDownload = !enforceDownloadPolicy || row.allow_file_download !== false;
  // Course-wide files must not inherit their source class in generated URLs;
  // learners from another class in the same course would otherwise be denied.
  const resolvedContextClassId = contextClassId
    || (enforceDownloadPolicy && row.visibility === "CLASS_ONLY" ? row.live_class_id : null);
  const classQuery = resolvedContextClassId ? `?classId=${encodeURIComponent(resolvedContextClassId)}` : "";
  const downloadQuery = resolvedContextClassId
    ? `?classId=${encodeURIComponent(resolvedContextClassId)}&download=1`
    : "?download=1";
  return {
    id: String(row.id),
    instanceId: row.placement_id ? `placement-${row.placement_id}` : `file-${row.id}`,
    placementId: row.placement_id ? String(row.placement_id) : null,
    isReused: Boolean(row.placement_id),
    name: row.original_name,
    sizeBytes: Number(row.size_bytes),
    mimeType: row.mime_type,
    uploadedAt: row.created_at,
    uploadedBy: row.uploaded_by_name || row.uploader_email || "Giáo viên",
    courseId: row.course_id ? String(row.course_id) : (row.class_course_id ? String(row.class_course_id) : null),
    courseTitle: row.course_title || null,
    courseCategory: row.course_category || null,
    classId: row.live_class_id ? String(row.live_class_id) : null,
    classTitle: row.class_title || null,
    classSessionId: row.class_session_id ? String(row.class_session_id) : null,
    sessionTitle: row.session_title || null,
    sessionStartTime: row.session_start_time || null,
    sessionEndTime: row.session_end_time || null,
    chapterId: row.chapter_id ? String(row.chapter_id) : null,
    chapterTitle: row.chapter_title || null,
    sourceClassId: row.source_live_class_id ? String(row.source_live_class_id) : null,
    sourceClassTitle: row.source_class_title || null,
    sourceSessionId: row.source_class_session_id ? String(row.source_class_session_id) : null,
    sourceSessionTitle: row.source_session_title || null,
    visibility: row.visibility,
    canDownload,
    viewUrl: `/api/files/${row.id}/download${classQuery}`,
    downloadUrl: canDownload ? `/api/files/${row.id}/download${downloadQuery}` : null,
  };
};

// GET /api/teacher/files
router.get("/teacher/files", protectRoute, requireTeacher, async (req, res) => {
  const courseId = req.query.courseId === undefined ? null : parseId(req.query.courseId);
  const classId = req.query.classId === undefined ? null : parseId(req.query.classId);
  const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
  const date = typeof req.query.date === "string" && req.query.date.trim() ? req.query.date.trim() : null;
  const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : null;

  try {
    const isAdmin = req.user.role === "admin";
    const files = await query(
      `${FILE_INSTANCES_CTE}
       SELECT fi.file_id AS id, fi.placement_id,
              fi.original_name, fi.storage_key, fi.storage_provider, fi.mime_type, fi.size_bytes,
              fi.uploaded_by, fi.status, fi.created_at, fi.updated_at,
              fi.effective_live_class_id AS live_class_id,
              fi.course_id, fi.effective_class_session_id AS class_session_id,
              fi.effective_visibility AS visibility,
              fi.live_class_id AS source_live_class_id,
              fi.class_session_id AS source_class_session_id,
              source_lc.title AS source_class_title, source_cs.title AS source_session_title,
              u.username AS uploaded_by_name, u.email AS uploader_email,
              COALESCE(c.title, c.name, c_lc.title, c_lc.name) AS course_title,
              COALESCE(c.category, c_lc.category) AS course_category,
              lc.title AS class_title, lc.course_id AS class_course_id,
              cs.title AS session_title, cs.start_time AS session_start_time, cs.end_time AS session_end_time,
              ch.id AS chapter_id, ch.title AS chapter_title
       FROM file_instances fi
       LEFT JOIN users u ON u.id = fi.uploaded_by
       LEFT JOIN courses c ON c.id = fi.course_id
       LEFT JOIN live_classes lc ON lc.id = fi.effective_live_class_id
       LEFT JOIN courses c_lc ON c_lc.id = lc.course_id
       LEFT JOIN class_sessions cs ON cs.id = fi.effective_class_session_id
       LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
       LEFT JOIN live_classes source_lc ON source_lc.id = fi.live_class_id
       LEFT JOIN class_sessions source_cs ON source_cs.id = fi.class_session_id
       WHERE fi.status = 'ready'
         AND ($1::boolean OR (
           fi.uploaded_by = $2
           OR (fi.effective_live_class_id IS NOT NULL AND (
             (lc.instructor_id = $2 AND NOT EXISTS (
               SELECT 1 FROM class_teachers former
               WHERE former.live_class_id = lc.id AND former.teacher_id = $2
             ))
             OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active')
           ))
           OR (fi.course_id IS NOT NULL AND EXISTS (SELECT 1 FROM courses c2 WHERE c2.id = fi.course_id AND c2.author_id = $2))
         ))
         AND ($3::bigint IS NULL OR COALESCE(fi.course_id, lc.course_id) = $3)
         AND ($4::bigint IS NULL OR fi.effective_live_class_id = $4)
         AND ($5::bigint IS NULL OR fi.effective_class_session_id = $5)
         AND ($6::date IS NULL OR (cs.start_time IS NOT NULL AND cs.start_time::date = $6::date))
         AND ($7::text IS NULL OR (
           fi.original_name ILIKE '%' || $7 || '%'
           OR COALESCE(c.title, c.name, c_lc.title, c_lc.name, '') ILIKE '%' || $7 || '%'
           OR COALESCE(lc.title, '') ILIKE '%' || $7 || '%'
           OR COALESCE(cs.title, '') ILIKE '%' || $7 || '%'
         ))
       ORDER BY COALESCE(cs.start_time, fi.attached_at) DESC, fi.file_id DESC`,
      [isAdmin, req.user.id, courseId, classId, sessionId, date, search],
    );
    return res.json({ success: true, data: files.rows.map(serializeFile) });
  } catch (error) {
    console.error("Error listing teacher files:", error);
    return errorResponse(res, 500, "Không thể tải danh sách tài liệu", "INTERNAL_ERROR");
  }
});

// GET /api/teacher/classes-lookup
router.get("/teacher/classes-lookup", protectRoute, requireTeacher, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const classesRes = await query(
      `SELECT lc.id, lc.title, lc.status, lc.course_id,
              COALESCE(c.title, c.name) AS course_title, c.category AS course_category
       FROM live_classes lc
       LEFT JOIN courses c ON c.id = lc.course_id
       WHERE lc.status <> 'cancelled'
         AND ($1::boolean OR EXISTS (
           SELECT 1 FROM class_teachers ct
           WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
         ) OR (
           lc.instructor_id = $2 AND NOT EXISTS (
             SELECT 1 FROM class_teachers assigned
             WHERE assigned.live_class_id = lc.id AND assigned.teacher_id = $2
           )
         ))
       ORDER BY lc.created_at DESC`,
      [isAdmin, req.user.id],
    );

    const classIds = classesRes.rows.map((r) => r.id);
    let sessions = [];
    if (classIds.length > 0) {
      const sessionsRes = await query(
        `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
                ch.id AS chapter_id, ch.title AS chapter_title
         FROM class_sessions cs
         LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
         WHERE cs.live_class_id = ANY($1::bigint[]) AND cs.status <> 'cancelled'
         ORDER BY cs.start_time ASC, cs.id ASC`,
        [classIds],
      );
      sessions = sessionsRes.rows.map((s) => ({
        id: String(s.id),
        classId: String(s.live_class_id),
        title: s.title,
        startTime: s.start_time,
        endTime: s.end_time,
        status: s.status,
        chapterId: s.chapter_id ? String(s.chapter_id) : null,
        chapterTitle: s.chapter_title || null,
      }));
    }

    const classes = classesRes.rows.map((c) => ({
      id: String(c.id),
      title: c.title,
      status: c.status,
      courseId: c.course_id ? String(c.course_id) : null,
      courseTitle: c.course_title || "Khóa học",
      courseCategory: c.course_category || "CSCA",
      sessions: sessions.filter((s) => s.classId === String(c.id)),
    }));

    return res.json({ success: true, data: classes });
  } catch (error) {
    console.error("Error looking up teacher classes:", error);
    return errorResponse(res, 500, "Không thể tải danh sách lớp học", "INTERNAL_ERROR");
  }
});

// GET /api/student/classes-lookup
router.get("/student/classes-lookup", protectRoute, async (req, res) => {
  if (req.user.role !== "user" && req.user.role !== "admin" && req.user.role !== "creator") {
    return errorResponse(res, 403, "Chỉ học viên và quản trị viên mới dùng endpoint này", "FORBIDDEN");
  }
  if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
    return errorResponse(res, 403, "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực", "LMS_ACCESS_NOT_GRANTED");
  }
  try {
    const classesRes = req.user.role === "admin"
      ? await query(
          `SELECT lc.id, lc.title, lc.status, lc.course_id, lc.allow_file_download,
                  COALESCE(c.title, c.name) AS course_title, c.category AS course_category
           FROM live_classes lc
           LEFT JOIN courses c ON c.id = lc.course_id
           WHERE lc.status = 'active'
           ORDER BY lc.created_at DESC`,
        )
      : await query(
          `SELECT lc.id, lc.title, lc.status, lc.course_id, lc.allow_file_download,
                  COALESCE(c.title, c.name) AS course_title, c.category AS course_category
           FROM live_classes lc
           JOIN class_enrollments ce ON ce.live_class_id = lc.id
           LEFT JOIN courses c ON c.id = lc.course_id
           WHERE lc.status = 'active'
             AND ce.user_id = $1 AND ce.status = 'active'
             AND EXISTS (
               SELECT 1 FROM lms_access_grants g
               WHERE g.user_id = $1 AND g.course_id = lc.course_id AND g.access_status = 'active'
                 AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
             )
           ORDER BY lc.created_at DESC`,
          [req.user.id],
        );

    const classIds = classesRes.rows.map((r) => r.id);
    let sessions = [];
    if (classIds.length > 0) {
      const sessionsRes = await query(
        `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
                ch.id AS chapter_id, ch.title AS chapter_title
         FROM class_sessions cs
         LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
         WHERE cs.live_class_id = ANY($1::bigint[]) AND cs.status <> 'cancelled'
         ORDER BY cs.start_time ASC, cs.id ASC`,
        [classIds],
      );
      sessions = sessionsRes.rows.map((s) => ({
        id: String(s.id),
        classId: String(s.live_class_id),
        title: s.title,
        startTime: s.start_time,
        endTime: s.end_time,
        status: s.status,
        chapterId: s.chapter_id ? String(s.chapter_id) : null,
        chapterTitle: s.chapter_title || null,
      }));
    }

    const classes = classesRes.rows.map((c) => ({
      id: String(c.id),
      title: c.title,
      status: c.status,
      courseId: c.course_id ? String(c.course_id) : null,
      courseTitle: c.course_title || "Khóa học",
      courseCategory: c.course_category || "CSCA",
      allowFileDownload: c.allow_file_download !== false,
      sessions: sessions.filter((s) => s.classId === String(c.id)),
    }));

    return res.json({ success: true, data: classes });
  } catch (error) {
    console.error("Error looking up student classes:", error);
    return errorResponse(res, 500, "Không thể tải danh sách lớp học", "INTERNAL_ERROR");
  }
});

// POST /api/teacher/courses/:courseId/files/upload-url
// PDF sources are intentionally course scoped so every authorised learner can
// open the paper in the protected quiz player.
router.post("/teacher/courses/:courseId/files/upload-url", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const { filename, mimeType, sizeBytes } = req.body || {};
  if (!courseId || !safeFilename(filename) || mimeType !== "application/pdf") {
    return errorResponse(res, 422, "Đề quiz phải là file PDF hợp lệ", "VALIDATION_ERROR");
  }
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MAX_LEARNING_FILE_SIZE_BYTES) {
    return errorResponse(res, 422, "Kích thước file PDF phải từ 1 byte đến 400MB", "VALIDATION_ERROR");
  }
  try {
    const access = await courseAccess(courseId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy khóa học", "NOT_FOUND");
    if (access.error || !access.canManage) return errorResponse(res, 403, "Bạn không có quyền tải đề lên khóa học này", "FORBIDDEN");
    const upload = await generateLearningFileUploadPresignedUrl({ userId: req.user.id, filename, mimeType, sizeBytes });
    const result = await query(
      `INSERT INTO lms_learning_files
         (course_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'COURSE', 'pending')
       RETURNING id`,
      [courseId, req.user.id, filename.trim(), upload.fileKey, mimeType, Number(sizeBytes)],
    );
    return res.status(201).json({ success: true, data: { fileId: String(result.rows[0].id), ...upload } });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error creating quiz paper upload:", error);
    return errorResponse(res, 500, "Không thể tạo upload đề quiz", "INTERNAL_ERROR");
  }
});

// GET /api/teacher/classes/:classId/files
router.get("/teacher/classes/:classId/files", protectRoute, requireTeacher, async (req, res) => {
  const classId = parseId(req.params.classId);
  const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
  if (!classId) return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
  if (req.query.sessionId !== undefined && !sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
  try {
    const access = await classAccess(classId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    if (access.error) return errorResponse(res, 403, "Bạn không có quyền xem tài liệu lớp này", "FORBIDDEN");
    if (sessionId) {
      const session = await query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2", [sessionId, classId]);
      if (session.rows.length === 0) return errorResponse(res, 404, "Không tìm thấy buổi học của lớp này", "NOT_FOUND");
    }
    const files = await query(
      `${FILE_INSTANCES_CTE}
       SELECT fi.file_id AS id, fi.placement_id,
              fi.original_name, fi.storage_key, fi.storage_provider, fi.mime_type, fi.size_bytes,
              fi.uploaded_by, fi.status, fi.created_at, fi.updated_at,
              fi.effective_live_class_id AS live_class_id,
              fi.course_id, fi.effective_class_session_id AS class_session_id,
              fi.effective_visibility AS visibility,
              fi.live_class_id AS source_live_class_id,
              fi.class_session_id AS source_class_session_id,
              source_lc.title AS source_class_title, source_cs.title AS source_session_title,
              u.username AS uploaded_by_name, u.email AS uploader_email,
              COALESCE(c.title, c.name) AS course_title, c.category AS course_category,
              lc.title AS class_title,
              cs.title AS session_title, cs.start_time AS session_start_time, cs.end_time AS session_end_time,
              ch.id AS chapter_id, ch.title AS chapter_title
       FROM file_instances fi
       LEFT JOIN users u ON u.id = fi.uploaded_by
       LEFT JOIN live_classes lc ON lc.id = fi.effective_live_class_id
       LEFT JOIN courses c ON c.id = COALESCE(fi.course_id, lc.course_id)
       LEFT JOIN class_sessions cs ON cs.id = fi.effective_class_session_id
       LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
       LEFT JOIN live_classes source_lc ON source_lc.id = fi.live_class_id
       LEFT JOIN class_sessions source_cs ON source_cs.id = fi.class_session_id
       WHERE fi.effective_live_class_id = $1 AND fi.status = 'ready'
         AND ($2::bigint IS NULL OR fi.effective_class_session_id = $2)
         AND ($3::boolean OR fi.effective_visibility <> 'PRIVATE' OR fi.uploaded_by = $4)
       ORDER BY COALESCE(cs.start_time, fi.attached_at) DESC, fi.file_id DESC`,
      [classId, sessionId, req.user.role === "admin", req.user.id],
    );
    return res.json({ success: true, data: files.rows.map(serializeFile) });
  } catch (error) {
    console.error("Error listing class files:", error);
    return errorResponse(res, 500, "Không thể tải tài liệu lớp học", "INTERNAL_ERROR");
  }
});

// GET /api/teacher/files/reusable — files that can be linked to a target class/session.
router.get("/teacher/files/reusable", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const classId = parseId(req.query.classId);
  const sessionId = req.query.sessionId === undefined || req.query.sessionId === "" ? null : parseId(req.query.sessionId);
  const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : null;
  if (!classId) return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
  if (req.query.sessionId !== undefined && req.query.sessionId !== "" && !sessionId) {
    return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const targetAccess = await classAccess(classId, req.user);
    if (targetAccess.error === "not_found") return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    if (targetAccess.error || !targetAccess.canManage) return errorResponse(res, 403, "Bạn không có quyền gắn tài liệu vào lớp này", "FORBIDDEN");
    if (sessionId) {
      const session = await query(
        "SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'",
        [sessionId, classId],
      );
      if (!session.rows.length) return errorResponse(res, 422, "Buổi học không thuộc lớp đã chọn hoặc đã bị hủy", "VALIDATION_ERROR");
    }

    const isAdmin = req.user.role === "admin";
    const files = await query(
      `SELECT f.*, u.username AS uploaded_by_name, u.email AS uploader_email,
              COALESCE(c.title, c.name, source_course.title, source_course.name) AS course_title,
              COALESCE(c.category, source_course.category) AS course_category,
              source_lc.title AS source_class_title,
              source_cs.title AS source_session_title,
              source_lc.course_id AS class_course_id,
              (SELECT COUNT(*)::int FROM lms_learning_file_placements usage WHERE usage.file_id = f.id) AS reuse_count
       FROM lms_learning_files f
       LEFT JOIN users u ON u.id = f.uploaded_by
       LEFT JOIN live_classes source_lc ON source_lc.id = f.live_class_id
       LEFT JOIN class_sessions source_cs ON source_cs.id = f.class_session_id
       LEFT JOIN courses c ON c.id = f.course_id
       LEFT JOIN courses source_course ON source_course.id = source_lc.course_id
       WHERE f.status = 'ready'
         AND COALESCE(f.course_id, source_lc.course_id) = $1
         AND ($2::boolean OR f.uploaded_by = $3 OR (
           f.live_class_id IS NOT NULL AND (
             (source_lc.instructor_id = $3 AND NOT EXISTS (
               SELECT 1 FROM class_teachers former
               WHERE former.live_class_id = source_lc.id AND former.teacher_id = $3
             ))
             OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = source_lc.id AND ct.teacher_id = $3 AND ct.status = 'active')
           )
         ) OR EXISTS (SELECT 1 FROM courses owned WHERE owned.id = COALESCE(f.course_id, source_lc.course_id) AND owned.author_id = $3))
         AND ($2::boolean OR f.visibility <> 'PRIVATE' OR f.uploaded_by = $3)
         AND ($4::text IS NULL OR f.original_name ILIKE '%' || $4 || '%')
         AND NOT (
           f.live_class_id = $5
           AND (($6::bigint IS NULL AND f.class_session_id IS NULL) OR f.class_session_id = $6)
         )
         AND NOT EXISTS (
           SELECT 1 FROM lms_learning_file_placements existing
           WHERE existing.file_id = f.id AND existing.live_class_id = $5
             AND (($6::bigint IS NULL AND existing.class_session_id IS NULL) OR existing.class_session_id = $6)
         )
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT 200`,
      [targetAccess.liveClass.course_id, isAdmin, req.user.id, search, classId, sessionId],
    );
    return res.json({
      success: true,
      data: files.rows.map((row) => ({
        ...serializeFile(row),
        reuseCount: Number(row.reuse_count || 0),
      })),
    });
  } catch (error) {
    console.error("Error listing reusable learning files:", error);
    return errorResponse(res, 500, "Không thể tải kho tài liệu dùng lại", "INTERNAL_ERROR");
  }
});

// POST /api/teacher/files/:fileId/placements — link one stored file to another class/session.
router.post("/teacher/files/:fileId/placements", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const fileId = parseId(req.params.fileId);
  const classId = parseId(req.body?.classId);
  const sessionId = req.body?.sessionId === undefined || req.body?.sessionId === "" ? null : parseId(req.body.sessionId);
  if (!fileId || !classId) return errorResponse(res, 422, "Tài liệu hoặc lớp học không hợp lệ", "VALIDATION_ERROR");
  if (req.body?.sessionId !== undefined && req.body?.sessionId !== "" && !sessionId) {
    return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const targetAccess = await classAccess(classId, req.user);
    if (targetAccess.error === "not_found") return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    if (targetAccess.error || !targetAccess.canManage) return errorResponse(res, 403, "Bạn không có quyền gắn tài liệu vào lớp này", "FORBIDDEN");
    if (sessionId) {
      const session = await query(
        "SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'",
        [sessionId, classId],
      );
      if (!session.rows.length) return errorResponse(res, 422, "Buổi học không thuộc lớp đã chọn hoặc đã bị hủy", "VALIDATION_ERROR");
    }

    const file = (await query(
      `SELECT f.*, source_lc.course_id AS source_class_course_id
       FROM lms_learning_files f
       LEFT JOIN live_classes source_lc ON source_lc.id = f.live_class_id
       WHERE f.id = $1 AND f.status = 'ready'`,
      [fileId],
    )).rows[0];
    if (!file) return errorResponse(res, 404, "Không tìm thấy tài liệu", "NOT_FOUND");
    const sourceAccess = file.live_class_id
      ? await classAccess(file.live_class_id, req.user)
      : await courseAccess(file.course_id, req.user);
    const ownsFile = String(file.uploaded_by || "") === String(req.user.id);
    if (req.user.role !== "admin" && !ownsFile && (sourceAccess.error || !sourceAccess.canManage)) {
      return errorResponse(res, 403, "Bạn không có quyền dùng lại tài liệu này", "FORBIDDEN");
    }
    if (file.visibility === "PRIVATE" && req.user.role !== "admin" && !ownsFile) {
      return errorResponse(res, 403, "Tài liệu riêng tư chỉ người tải lên mới được dùng lại", "FORBIDDEN");
    }
    const sourceCourseId = file.course_id || file.source_class_course_id;
    if (String(sourceCourseId) !== String(targetAccess.liveClass.course_id)) {
      return errorResponse(res, 409, "Chỉ có thể dùng lại tài liệu giữa các lớp thuộc cùng một khóa học", "COURSE_SCOPE_MISMATCH");
    }
    const directDuplicate = String(file.live_class_id || "") === String(classId)
      && String(file.class_session_id || "") === String(sessionId || "");
    if (directDuplicate) return errorResponse(res, 409, "Tài liệu đã có ở vị trí này", "FILE_ALREADY_ATTACHED");

    const result = await query(
      `INSERT INTO lms_learning_file_placements(file_id, live_class_id, class_session_id, attached_by, visibility)
       VALUES ($1, $2, $3, $4, 'CLASS_ONLY')
       ON CONFLICT DO NOTHING
       RETURNING id, file_id, live_class_id, class_session_id, visibility, created_at`,
      [fileId, classId, sessionId, req.user.id],
    );
    if (!result.rows.length) return errorResponse(res, 409, "Tài liệu đã được gắn vào vị trí này", "FILE_ALREADY_ATTACHED");
    await recordAuditEvent({
      actorId: req.user.id,
      action: "learning_file.attached",
      entityType: "learning_file_placement",
      entityId: result.rows[0].id,
      afterState: result.rows[0],
      metadata: { ip: req.ip, fileId, classId, sessionId },
    });
    return res.status(201).json({ success: true, data: { placementId: String(result.rows[0].id) }, message: "Đã dùng lại tài liệu" });
  } catch (error) {
    console.error("Error attaching reusable learning file:", error);
    return errorResponse(res, 500, "Không thể gắn tài liệu đã chọn", "INTERNAL_ERROR");
  }
});

router.delete("/teacher/file-placements/:placementId", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const placementId = parseId(req.params.placementId);
  if (!placementId) return errorResponse(res, 422, "placementId không hợp lệ", "VALIDATION_ERROR");
  try {
    const placement = (await query(
      "SELECT id, file_id, live_class_id, class_session_id FROM lms_learning_file_placements WHERE id = $1",
      [placementId],
    )).rows[0];
    if (!placement) return errorResponse(res, 404, "Không tìm thấy liên kết tài liệu", "NOT_FOUND");
    const access = await classAccess(placement.live_class_id, req.user);
    if (access.error || !access.canManage) return errorResponse(res, 403, "Bạn không có quyền gỡ tài liệu khỏi lớp này", "FORBIDDEN");
    await query("DELETE FROM lms_learning_file_placements WHERE id = $1", [placementId]);
    await recordAuditEvent({
      actorId: req.user.id,
      action: "learning_file.detached",
      entityType: "learning_file_placement",
      entityId: placementId,
      beforeState: placement,
      metadata: { ip: req.ip },
    });
    return res.json({ success: true, message: "Đã gỡ tài liệu khỏi lớp hoặc buổi học" });
  } catch (error) {
    console.error("Error detaching reusable learning file:", error);
    return errorResponse(res, 500, "Không thể gỡ tài liệu", "INTERNAL_ERROR");
  }
});

// POST /api/teacher/classes/:classId/files/upload-url
router.post("/teacher/classes/:classId/files/upload-url", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const classId = parseId(req.params.classId);
  const { filename, mimeType, sizeBytes, visibility = "CLASS_ONLY" } = req.body || {};
  const classSessionId = parseId(req.body?.classSessionId);
  if (!classId || !safeFilename(filename) || !ALLOWED_LEARNING_FILE_MIME_TYPES.has(mimeType)) {
    return errorResponse(res, 422, "Thông tin tài liệu không hợp lệ", "VALIDATION_ERROR");
  }
  if (req.body?.classSessionId !== undefined && !classSessionId) return errorResponse(res, 422, "classSessionId không hợp lệ", "VALIDATION_ERROR");
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MAX_LEARNING_FILE_SIZE_BYTES) {
    return errorResponse(res, 422, "Kích thước tài liệu phải từ 1 byte đến 400MB", "VALIDATION_ERROR");
  }
  if (!["CLASS_ONLY", "COURSE", "PRIVATE"].includes(visibility)) return errorResponse(res, 422, "visibility không hợp lệ", "VALIDATION_ERROR");
  try {
    const access = await classAccess(classId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    if (access.error || !access.canManage) return errorResponse(res, 403, "Bạn không có quyền tải tài liệu lên lớp này", "FORBIDDEN");
    if (classSessionId) {
      const session = await query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'", [classSessionId, classId]);
      if (session.rows.length === 0) return errorResponse(res, 422, "Buổi học không thuộc lớp đã chọn hoặc đã bị hủy", "VALIDATION_ERROR");
    }
    const upload = await generateLearningFileUploadPresignedUrl({ userId: req.user.id, filename, mimeType, sizeBytes });
    const result = await query(
      `INSERT INTO lms_learning_files
         (live_class_id, course_id, class_session_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id, original_name, storage_key, mime_type, size_bytes, visibility, status`,
      [classId, access.liveClass.course_id, classSessionId, req.user.id, filename.trim(), upload.fileKey, mimeType, Number(sizeBytes), visibility],
    );
    return res.status(201).json({ success: true, data: { fileId: String(result.rows[0].id), ...upload } });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error creating learning file upload:", error);
    return errorResponse(res, 500, "Không thể tạo upload tài liệu", "INTERNAL_ERROR");
  }
});

// POST /api/teacher/files/:fileId/confirm
router.post("/teacher/files/:fileId/confirm", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const fileId = parseId(req.params.fileId);
  if (!fileId) return errorResponse(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");
  try {
    const file = (await query("SELECT * FROM lms_learning_files WHERE id = $1", [fileId])).rows[0];
    if (!file) return errorResponse(res, 404, "Không tìm thấy tài liệu", "NOT_FOUND");
    if (file.status !== "pending") return errorResponse(res, 409, "Tài liệu không ở trạng thái chờ xác nhận", "INVALID_STATUS");
    const access = file.live_class_id
      ? await classAccess(file.live_class_id, req.user)
      : await courseAccess(file.course_id, req.user);
    if (access.error || !access.canManage || (req.user.role !== "admin" && String(file.uploaded_by) !== String(req.user.id))) {
      return errorResponse(res, 403, "Bạn không có quyền xác nhận tài liệu này", "FORBIDDEN");
    }
    const { headUrl } = await generateLearningFileHeadSignedUrl({ r2Key: file.storage_key });
    const headResponse = await fetch(headUrl, { method: "HEAD" });
    if (!headResponse.ok) {
      await query("UPDATE lms_learning_files SET status = 'failed' WHERE id = $1", [fileId]);
      return errorResponse(res, 422, "Không tìm thấy object tài liệu trên R2", "UPLOAD_NOT_FOUND");
    }
    const result = await query("UPDATE lms_learning_files SET status = 'ready' WHERE id = $1 AND status = 'pending' RETURNING *", [fileId]);
    if (!result.rows.length) return errorResponse(res, 409, "Tài liệu đã được xác nhận", "INVALID_STATUS");
    await recordAuditEvent({ actorId: req.user.id, action: "learning_file.confirmed", entityType: "learning_file", entityId: fileId, afterState: result.rows[0], metadata: { ip: req.ip } });
    return res.json({ success: true, data: serializeFile(result.rows[0]) });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error confirming learning file:", error);
    return errorResponse(res, 500, "Không thể xác nhận tài liệu", "INTERNAL_ERROR");
  }
});

// GET /api/student/files
router.get("/student/files", protectRoute, async (req, res) => {
  if (req.user.role !== "user" && req.user.role !== "admin" && req.user.role !== "creator") {
    return errorResponse(res, 403, "Chỉ học viên và quản trị viên mới dùng endpoint này", "FORBIDDEN");
  }
  if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
    return errorResponse(res, 403, "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực", "LMS_ACCESS_NOT_GRANTED");
  }
  try {
    const courseId = req.query.courseId === undefined ? null : parseId(req.query.courseId);
    if (req.query.courseId !== undefined && !courseId) {
      return errorResponse(res, 422, "courseId không hợp lệ", "VALIDATION_ERROR");
    }
    const classId = req.query.classId === undefined ? null : parseId(req.query.classId);
    if (req.query.classId !== undefined && !classId) {
      return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
    }
    const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
    if (req.query.sessionId !== undefined && !sessionId) {
      return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    }
    if (sessionId && !classId) {
      return errorResponse(res, 422, "sessionId cần đi kèm classId", "VALIDATION_ERROR");
    }
    const date = typeof req.query.date === "string" && req.query.date.trim() ? req.query.date.trim() : null;
    const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : null;

    if (classId) {
      const classAccessResult = await query(
        `SELECT lc.course_id FROM live_classes lc
         JOIN class_enrollments ce ON ce.live_class_id = lc.id
         WHERE lc.id = $1 AND lc.status = 'active'
           AND ce.user_id = $2 AND ce.status = 'active'
           AND ($3::bigint IS NULL OR lc.course_id = $3)
           AND EXISTS (
             SELECT 1 FROM lms_access_grants g
             WHERE g.user_id = $2 AND g.course_id = lc.course_id AND g.access_status = 'active'
               AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
           )`,
        [classId, req.user.id, courseId],
      );
      if (req.user.role !== "admin" && classAccessResult.rows.length === 0) {
        return errorResponse(res, 403, "Bạn không có quyền xem tài liệu của lớp này", "FORBIDDEN");
      }
      if (sessionId) {
        const sessionAccess = await query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2", [sessionId, classId]);
        if (sessionAccess.rows.length === 0) return errorResponse(res, 404, "Không tìm thấy buổi học của lớp này", "NOT_FOUND");
      }
    }
    const result = await query(
      `${FILE_INSTANCES_CTE}
       SELECT DISTINCT fi.file_id AS id, fi.placement_id,
              fi.original_name, fi.storage_key, fi.storage_provider, fi.mime_type, fi.size_bytes,
              fi.uploaded_by, fi.status, fi.created_at, fi.updated_at,
              fi.effective_live_class_id AS live_class_id,
              fi.course_id, fi.effective_class_session_id AS class_session_id,
              fi.effective_visibility AS visibility,
              fi.live_class_id AS source_live_class_id,
              fi.class_session_id AS source_class_session_id,
              source_lc.title AS source_class_title, source_cs.title AS source_session_title,
              CASE
                WHEN fi.effective_visibility = 'CLASS_ONLY' AND fi.effective_live_class_id IS NOT NULL
                  THEN COALESCE(lc.allow_file_download, TRUE)
                WHEN $3::bigint IS NOT NULL THEN COALESCE((
                  SELECT policy_class.allow_file_download
                  FROM live_classes policy_class
                  JOIN class_enrollments policy_enrollment ON policy_enrollment.live_class_id = policy_class.id
                  WHERE policy_class.id = $3 AND policy_class.course_id = COALESCE(fi.course_id, lc.course_id)
                    AND policy_class.status = 'active' AND policy_enrollment.user_id = $1
                    AND policy_enrollment.status = 'active'
                ), TRUE)
                ELSE NOT EXISTS (
                  SELECT 1
                  FROM live_classes policy_class
                  JOIN class_enrollments policy_enrollment ON policy_enrollment.live_class_id = policy_class.id
                  WHERE policy_class.course_id = COALESCE(fi.course_id, lc.course_id)
                    AND policy_class.status = 'active' AND policy_enrollment.user_id = $1
                    AND policy_enrollment.status = 'active' AND policy_class.allow_file_download = FALSE
                )
              END AS allow_file_download,
              COALESCE(cs.start_time, fi.attached_at) AS sort_time,
              COALESCE(c.title, c.name, c_lc.title, c_lc.name) AS course_title,
              COALESCE(c.category, c_lc.category) AS course_category,
              lc.title AS class_title, lc.course_id AS class_course_id,
              cs.title AS session_title, cs.start_time AS session_start_time, cs.end_time AS session_end_time,
              ch.id AS chapter_id, ch.title AS chapter_title,
              u.username AS uploaded_by_name, u.email AS uploader_email
       FROM file_instances fi
       LEFT JOIN courses c ON c.id = fi.course_id
       LEFT JOIN live_classes lc ON lc.id = fi.effective_live_class_id
       LEFT JOIN courses c_lc ON c_lc.id = lc.course_id
       LEFT JOIN class_sessions cs ON cs.id = fi.effective_class_session_id
       LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
       LEFT JOIN users u ON u.id = fi.uploaded_by
       LEFT JOIN live_classes source_lc ON source_lc.id = fi.live_class_id
       LEFT JOIN class_sessions source_cs ON source_cs.id = fi.class_session_id
       WHERE fi.status = 'ready'
         AND ($2::bigint IS NULL OR COALESCE(fi.course_id, lc.course_id) = $2)
         AND ($3::bigint IS NULL OR fi.effective_live_class_id IS NULL OR fi.effective_live_class_id = $3)
         AND ($4::bigint IS NULL OR fi.effective_class_session_id = $4)
         AND ($5::date IS NULL OR (cs.start_time IS NOT NULL AND cs.start_time::date = $5::date))
         AND ($6::text IS NULL OR (
           fi.original_name ILIKE '%' || $6 || '%'
           OR COALESCE(c.title, c.name, c_lc.title, c_lc.name, '') ILIKE '%' || $6 || '%'
           OR COALESCE(lc.title, '') ILIKE '%' || $6 || '%'
           OR COALESCE(cs.title, '') ILIKE '%' || $6 || '%'
         ))
         AND fi.effective_visibility IN ('CLASS_ONLY', 'COURSE')
         AND (
           $7::boolean = TRUE
           OR (
             EXISTS (
               SELECT 1 FROM lms_access_grants g
               WHERE g.course_id = CASE WHEN fi.effective_live_class_id IS NOT NULL THEN lc.course_id ELSE fi.course_id END
                 AND g.user_id = $1 AND g.access_status = 'active'
                 AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
             )
             AND (fi.effective_visibility = 'COURSE' OR (fi.effective_visibility = 'CLASS_ONLY'
               AND fi.effective_live_class_id IS NOT NULL AND lc.status = 'active'
               AND EXISTS (SELECT 1 FROM class_enrollments ce
                           WHERE ce.live_class_id = fi.effective_live_class_id AND ce.user_id = $1 AND ce.status = 'active')))
           )
         )
       ORDER BY sort_time DESC, id DESC`,
      [req.user.id, courseId, classId, sessionId, date, search, req.user.role === 'admin'],
    );
    return res.json({
      success: true,
      data: result.rows.map((row) => serializeFile(row, {
        enforceDownloadPolicy: true,
        contextClassId: classId,
      })),
    });
  } catch (error) {
    console.error("Error listing student files:", error);
    return errorResponse(res, 500, "Không thể tải tài liệu học tập", "INTERNAL_ERROR");
  }
});

const canDeleteFile = async (fileId, user) => {
  const result = await query("SELECT id, uploaded_by, live_class_id, course_id, storage_key, status FROM lms_learning_files WHERE id = $1", [fileId]);
  const file = result.rows[0];
  if (!file) return { error: "not_found" };
  if (file.status === "deleted") return { error: "not_found" };
  if (user.role === "admin") return { file };
  if (user.role === "creator") {
    const access = file.live_class_id
      ? await classAccess(file.live_class_id, user)
      : await courseAccess(file.course_id, user);
    if (access.error || !access.canManage) return { error: "forbidden" };
    return { file };
  }
  return { error: "forbidden" };
};

router.delete("/teacher/files/:fileId", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const fileId = parseId(req.params.fileId);
  if (!fileId) return errorResponse(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");
  try {
    const access = await canDeleteFile(fileId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy tài liệu", "NOT_FOUND");
    if (access.error) return errorResponse(res, 403, "Bạn không có quyền xóa tài liệu", "FORBIDDEN");
    const placements = await query(
      "SELECT COUNT(*)::int AS count FROM lms_learning_file_placements WHERE file_id = $1",
      [fileId],
    );
    if (Number(placements.rows[0]?.count || 0) > 0) {
      return errorResponse(
        res,
        409,
        "Tài liệu đang được dùng lại ở lớp hoặc buổi học khác. Hãy gỡ các liên kết trước khi xóa file gốc.",
        "FILE_IN_USE",
      );
    }

    let r2Deleted = false;
    const storageKey = access.file?.storage_key;
    if (storageKey) {
      try {
        await deleteLearningFileObject({ r2Key: storageKey });
        r2Deleted = true;
      } catch (storageError) {
        if (storageError.code === "R2_NOT_CONFIGURED") {
          console.warn("R2 chưa được cấu hình, bỏ qua xóa object R2:", storageError.message);
        } else {
          console.error("Lỗi xóa file trên Cloudflare R2:", storageError);
          return errorResponse(res, 502, "Không thể xóa tài liệu trên kho lưu trữ R2. Vui lòng thử lại sau.", "STORAGE_DELETE_FAILED");
        }
      }
    }

    await query("UPDATE lms_learning_files SET status = 'deleted', updated_at = NOW() WHERE id = $1", [fileId]);
    await query("UPDATE quizzes SET paper_file_id = NULL WHERE paper_file_id = $1", [fileId]).catch(() => {});
    await query("UPDATE quizzes SET solution_file_id = NULL WHERE solution_file_id = $1", [fileId]).catch(() => {});
    await query("UPDATE assignments SET attachment_url = NULL WHERE attachment_url LIKE $1", [`%/files/${fileId}/download%`]).catch(() => {});
    await recordAuditEvent({
      actorId: req.user.id,
      action: "learning_file.deleted",
      entityType: "learning_file",
      entityId: fileId,
      metadata: { ip: req.ip, storageKey, r2Deleted },
    });
    return res.json({ success: true, message: "Đã xóa tài liệu" });
  } catch (error) {
    console.error("Error deleting learning file:", error);
    return errorResponse(res, 500, "Không thể xóa tài liệu", "INTERNAL_ERROR");
  }
});

router.get("/files/:fileId/download", protectRoute, async (req, res) => {
  const fileId = parseId(req.params.fileId);
  if (!fileId) return errorResponse(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");
  const requestedClassId = req.query?.classId === undefined ? null : parseId(req.query.classId);
  if (req.query?.classId !== undefined && !requestedClassId) {
    return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
  }
  const videoCourseId = req.query?.videoCourseId === undefined ? null : parseId(req.query.videoCourseId);
  if (req.query?.videoCourseId !== undefined && !videoCourseId) {
    return errorResponse(res, 422, "videoCourseId không hợp lệ", "VALIDATION_ERROR");
  }
  const videoCourseProfileId = req.query?.videoCourseProfileId === undefined
    ? null
    : parseId(req.query.videoCourseProfileId);
  if (req.query?.videoCourseProfileId !== undefined && !videoCourseProfileId) {
    return errorResponse(res, 422, "videoCourseProfileId không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const access = await fileAccess(fileId, req.user, requestedClassId);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy tài liệu", "NOT_FOUND");
    if (access.error) return errorResponse(res, 403, "Bạn chưa được cấp quyền tải tài liệu", "FORBIDDEN");
    let videoCourseAllowsDownload = true;
    let selectedVideoProfile = null;
    const fileCourseId = access.file.course_id || access.file.class_course_id;
    if (videoCourseProfileId) {
      const policyRes = await query(
        `SELECT id, course_id, mode, source_live_class_id, management_class_id, allow_file_download
         FROM video_course_profiles
         WHERE id = $1 AND course_id = $2
           AND ($3::bigint IS NULL OR course_id = $3)`,
        [videoCourseProfileId, fileCourseId, videoCourseId],
      );
      if (!policyRes.rows[0]) {
        const fallbackRes = await query(
          `SELECT id, course_id, mode, source_live_class_id, management_class_id, allow_file_download
           FROM video_course_profiles
           WHERE course_id = $1 ORDER BY (status = 'active') DESC, id DESC LIMIT 1`,
          [fileCourseId || videoCourseId],
        );
        if (fallbackRes.rows[0]) {
          selectedVideoProfile = fallbackRes.rows[0];
          videoCourseAllowsDownload = selectedVideoProfile.allow_file_download === true;
        } else {
          return errorResponse(res, 404, "Không tìm thấy cấu hình khóa học video", "NOT_FOUND");
        }
      } else {
        selectedVideoProfile = policyRes.rows[0];
        videoCourseAllowsDownload = selectedVideoProfile.allow_file_download === true;
      }
    } else if (videoCourseId) {
      if (String(videoCourseId) !== String(fileCourseId)) {
        return errorResponse(res, 403, "Tài liệu không thuộc khóa học video này", "FORBIDDEN");
      }
      const policyRes = await query(
        `SELECT id, course_id, mode, source_live_class_id, management_class_id, allow_file_download
         FROM video_course_profiles
         WHERE course_id = $1 ORDER BY (status = 'active') DESC, id DESC`,
        [videoCourseId],
      );
      if (policyRes.rows.length === 0) {
        return errorResponse(res, 404, "Không tìm thấy cấu hình khóa học video", "NOT_FOUND");
      }
      selectedVideoProfile = policyRes.rows[0];
      videoCourseAllowsDownload = policyRes.rows.every((row) => row.allow_file_download === true);
    } else if (req.user.role === "user") {
      // Do not trust the browser to preserve video-course query parameters.
      // A Record learner must keep the selected profile's download policy even
      // when a direct file URL is copied or manually edited.
      const inferredPolicy = await query(
        `SELECT vcp.id, vcp.course_id, vcp.mode, vcp.source_live_class_id,
                vcp.management_class_id, vcp.allow_file_download
         FROM video_course_profiles vcp
         WHERE vcp.course_id = $1 AND vcp.status = 'active'
           AND EXISTS (
             SELECT 1
             FROM class_enrollments ce
             LEFT JOIN management_class_learning_aliases alias
               ON alias.id = ce.management_class_alias_id AND alias.status = 'active'
             WHERE ce.user_id = $2 AND ce.status = 'active' AND ce.learning_mode = 'recording'
               AND (
                 (vcp.management_class_id IS NOT NULL
                   AND LOWER(alias.alias_class_source_id) = LOWER(vcp.management_class_id))
                 OR (vcp.management_class_id IS NULL AND vcp.mode = 'MIRROR'
                   AND ce.live_class_id = vcp.source_live_class_id)
                 OR (vcp.management_class_id IS NULL AND vcp.mode = 'INDEPENDENT'
                   AND ce.course_id = vcp.course_id)
               )
           )
         ORDER BY vcp.id`,
        [fileCourseId, req.user.id],
      );
      if (inferredPolicy.rows.length > 0) {
        selectedVideoProfile = inferredPolicy.rows[0];
        videoCourseAllowsDownload = inferredPolicy.rows.every((row) => row.allow_file_download === true);
      }
    }

    if (req.user.role === "user" && selectedVideoProfile) {
      let unit = null;
      if (selectedVideoProfile.mode === "MIRROR") {
        unit = (await query(
          `SELECT cs.id
           FROM class_sessions cs
           WHERE cs.live_class_id = $2
             AND (cs.id = $3 OR EXISTS (
               SELECT 1 FROM lms_learning_file_placements placement
               WHERE placement.file_id = $1 AND placement.class_session_id = cs.id
             ))
           ORDER BY cs.start_time, cs.id LIMIT 1`,
          [fileId, selectedVideoProfile.source_live_class_id, access.file.class_session_id],
        )).rows[0] || null;
        if (unit && !(await isVideoCourseUnitUnlocked({
          db: { query },
          userId: req.user.id,
          unitType: "class_session",
          unitId: unit.id,
        }))) {
          return errorResponse(res, 403, "Tài liệu này sẽ mở sau khi bạn hoàn thành buổi học trước nhé.", "VIDEO_UNIT_LOCKED");
        }
      } else {
        unit = (await query(
          `SELECT l.id
           FROM lessons l
           JOIN lesson_learning_file_placements placement ON placement.lesson_id = l.id
           WHERE placement.file_id = $1 AND l.course_id = $2 AND l.is_published = TRUE
           ORDER BY l.sort_order, l.id LIMIT 1`,
          [fileId, selectedVideoProfile.course_id],
        )).rows[0] || null;
        if (unit && !(await isVideoCourseUnitUnlocked({
          db: { query },
          userId: req.user.id,
          unitType: "lesson",
          unitId: unit.id,
        }))) {
          return errorResponse(res, 403, "Tài liệu này sẽ mở sau khi bạn hoàn thành bài học trước nhé.", "VIDEO_UNIT_LOCKED");
        }
      }
    }
    const canDownload = access.canDownload !== false && videoCourseAllowsDownload;
    const forceDownload = ["1", "true"].includes(String(req.query?.download || "").toLowerCase());
    const enforceViewOnly = !canDownload && (req.user.role === "user" || Boolean(selectedVideoProfile));
    if (forceDownload && enforceViewOnly) {
      return errorResponse(res, 403, "Khóa học này chỉ cho phép xem tài liệu trực tuyến", "FILE_DOWNLOAD_DISABLED");
    }
    if (enforceViewOnly && !canDisplayInline(access.file)) {
      return errorResponse(res, 415, "Định dạng tài liệu này chưa hỗ trợ xem trực tuyến", "INLINE_VIEW_UNSUPPORTED");
    }
    const displayInline = canDisplayInline(access.file) && !forceDownload;
    const playbackMimeType = isPdfFile(access.file) ? "application/pdf" : access.file.mime_type;
    const { downloadUrl } = await generateLearningFilePlaybackSignedUrl({
      r2Key: access.file.storage_key,
      filename: access.file.original_name,
      disposition: displayInline ? "inline" : "attachment",
      mimeType: displayInline ? playbackMimeType : undefined,
    });
    if (typeof res.set === "function") {
      res.set({
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      });
    }
    if (enforceViewOnly && isPdfFile(access.file) && !forceDownload) {
      if (typeof res.set === "function") {
        res.set({
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy": "default-src 'self' 'unsafe-inline' https: blob: data:; object-src 'self' https: blob: data:; frame-src 'self' https: blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' https: blob: data:; frame-ancestors 'self'",
        });
      }
      return res.status(200).send(protectedPdfViewerHtml({
        filename: access.file.original_name,
        signedUrl: downloadUrl,
        fileSizeBytes: Number(access.file.file_size || access.file.file_size_bytes || 0),
      }));
    }
    return res.redirect(302, downloadUrl);
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error opening learning file:", error);
    return errorResponse(res, 500, "Không thể mở tài liệu", "INTERNAL_ERROR");
  }
});

// POST /api/files/images/upload — Same-origin upload avoids browser storage CORS failures.
router.post("/files/images/upload", protectRoute, acceptSingleImage, async (req, res) => {
  if (!req.file) {
    return errorResponse(res, 422, "Vui lòng chọn một tệp ảnh", "VALIDATION_ERROR");
  }

  const cleanFolder = ALLOWED_IMAGE_FOLDERS.has(req.body?.folder) ? req.body.folder : "general";
  if (cleanFolder !== "avatars" && req.user.role !== "admin" && req.user.role !== "creator") {
    return errorResponse(res, 403, "Bạn không có quyền tải ảnh vào thư mục này", "FORBIDDEN");
  }

  try {
    const upload = await generateImageUploadPresignedUrl({
      userId: req.user.id,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      folder: cleanFolder,
    });
    const storageResponse = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: req.file.buffer,
    });
    if (!storageResponse.ok) {
      const error = new Error(`Image storage rejected upload with status ${storageResponse.status}`);
      error.code = "IMAGE_UPLOAD_FAILED";
      throw error;
    }

    return res.status(201).json({
      success: true,
      data: { fileKey: upload.fileKey, publicUrl: upload.publicUrl },
    });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") {
      return errorResponse(res, 503, "Kho ảnh chưa được cấu hình", "IMAGE_STORAGE_NOT_CONFIGURED");
    }
    console.error("Error uploading image:", error);
    return errorResponse(res, 502, "Không thể tải ảnh lên kho lưu trữ", "IMAGE_UPLOAD_FAILED");
  }
});

// Legacy direct-upload endpoints remain for older clients.
router.post("/files/images/upload-url", protectRoute, async (req, res) => {
  const { filename, mimeType, sizeBytes, folder = "general" } = req.body || {};
  if (!safeFilename(filename) || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return errorResponse(res, 422, "Tệp ảnh không hợp lệ (hỗ trợ JPG, PNG, WEBP, GIF, SVG)", "VALIDATION_ERROR");
  }
  const cleanFolder = ALLOWED_IMAGE_FOLDERS.has(folder) ? folder : "general";
  if (cleanFolder !== "avatars" && req.user.role !== "admin" && req.user.role !== "creator") {
    return errorResponse(res, 403, "Chỉ quản trị viên hoặc giáo viên mới có quyền tải ảnh thư mục này", "FORBIDDEN");
  }
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MAX_IMAGE_SIZE_BYTES) {
    return errorResponse(res, 422, "Kích thước ảnh tối đa 10MB", "VALIDATION_ERROR");
  }
  try {
    const upload = await generateImageUploadPresignedUrl({
      userId: req.user.id,
      filename,
      mimeType,
      sizeBytes,
      folder: cleanFolder,
    });
    return res.status(201).json({ success: true, data: upload });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error generating image upload URL:", error);
    return errorResponse(res, 500, "Không thể tạo liên kết tải ảnh", "INTERNAL_ERROR");
  }
});

// POST /api/files/images/confirm — Verify image was successfully uploaded to Cloudflare R2
router.post("/files/images/confirm", protectRoute, async (req, res) => {
  const { fileKey } = req.body || {};
  if (!validateImageR2Key(fileKey)) {
    return errorResponse(res, 422, "fileKey ảnh không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const { headUrl } = await generateImageHeadSignedUrl({ r2Key: fileKey });
    const headRes = await fetch(headUrl, { method: "HEAD" });
    if (!headRes.ok) {
      return errorResponse(res, 422, "Không tìm thấy ảnh trên Cloudflare R2", "UPLOAD_NOT_FOUND");
    }
    const publicUrl = getR2PublicUrl(fileKey);
    return res.json({ success: true, data: { fileKey, publicUrl } });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error confirming image upload:", error);
    return errorResponse(res, 500, "Không thể xác nhận ảnh", "INTERNAL_ERROR");
  }
});

// GET /api/images/* — Public route to serve/redirect Cloudflare R2 images with 24h CDN caching
router.get("/images/*", async (req, res) => {
  const r2Key = req.params[0];
  if (!validateImageR2Key(r2Key)) {
    return errorResponse(res, 404, "Không tìm thấy ảnh", "NOT_FOUND");
  }
  try {
    const publicDomain = (process.env.R2_PUBLIC_DOMAIN || "").trim();
    if (publicDomain) {
      if (typeof res.set === "function") res.set("Cache-Control", "public, max-age=604800, s-maxage=2592000, immutable");
      return res.redirect(301, `${publicDomain.replace(/\/$/, "")}/${r2Key}`);
    }
    const { downloadUrl } = await generateImagePlaybackSignedUrl({ r2Key, expiresInSeconds: 86400 });
    if (typeof res.set === "function") {
      res.set({
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      });
    }
    return res.redirect(302, downloadUrl);
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error serving image:", error);
    return errorResponse(res, 500, "Không thể mở ảnh", "INTERNAL_ERROR");
  }
});

router.post("/files/cloudinary-signature", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const folder = typeof req.body?.folder === "string" && req.body.folder.trim()
    ? req.body.folder.trim().slice(0, 120)
    : "csca/lms";
  const resourceType = ["image", "raw", "video", "auto"].includes(req.body?.resourceType) ? req.body.resourceType : "auto";
  try {
    return res.json({ success: true, data: createCloudinaryUploadSignature({ folder, resourceType }) });
  } catch (error) {
    if (error.code === "CLOUDINARY_NOT_CONFIGURED") return errorResponse(res, 503, "Cloudinary chưa được cấu hình", error.code);
    console.error("Error creating Cloudinary signature:", error);
    return errorResponse(res, 500, "Không thể tạo chữ ký Cloudinary", "INTERNAL_ERROR");
  }
});

export default router;
