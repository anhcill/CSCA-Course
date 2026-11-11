import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiBookOpen,
  FiCheckCircle,
  FiCopy,
  FiEdit3,
  FiEye,
  FiEyeOff,
  FiExternalLink,
  FiFilm,
  FiFolderPlus,
  FiLayers,
  FiLock,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiShield,
  FiSliders,
  FiTrash2,
  FiUploadCloud,
  FiVideo,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import toast from "react-hot-toast";
import {
  attachVideoToLearningUnit,
  createAdminLearningUnitFormula,
  createAdminLearningUnitVocabulary,
  createAdminVideoCourseLesson,
  createAdminVideoCourseSection,
  createBunnyVideoUploadIntent,
  deleteAdminVideo,
  deleteAdminVideoCourseLesson,
  deleteAdminVideoCourseSection,
  fetchAdminVideoCourseDetail,
  fetchAdminVideoCoursesOverview,
  publishAdminVideo,
  publishAdminVideoCourse,
  reorderAdminVideoCourseCurriculum,
  replaceAdminVideo,
  revokeAdminUserTrustedDevice,
  saveAdminLearningUnitTheory,
  saveAdminVideoCourseProfile,
  unpublishAdminVideo,
  updateAdminVideoCourseUnitPreview,
} from "../../features/api/lmsClient";

const TUS_VERSION = "1.0.0";
const TUS_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

const encodeTusMetadataValue = (value) => {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

const runTusRequest = ({ method, url, headers, body = null, onProgress = null }) => (
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    Object.entries(headers || {}).forEach(([name, value]) => {
      xhr.setRequestHeader(name, String(value));
    });
    if (onProgress) xhr.upload.onprogress = onProgress;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr);
        return;
      }
      reject(new Error(`Bunny TUS từ chối upload (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Mất kết nối khi tải video trực tiếp lên Bunny Stream"));
    xhr.onabort = () => reject(new Error("Upload Bunny Stream đã bị hủy"));
    xhr.send(body);
  })
);

const uploadFileToBunnyTus = async ({ file, intent, onProgress }) => {
  if (!file || !intent?.tusEndpoint || !intent?.tusHeaders) {
    throw new Error("Thiếu file hoặc thông tin xác thực TUS từ máy chủ");
  }

  const creationResponse = await runTusRequest({
    method: "POST",
    url: intent.tusEndpoint,
    headers: {
      ...intent.tusHeaders,
      "Tus-Resumable": TUS_VERSION,
      "Upload-Length": file.size,
      "Upload-Metadata": [
        `filename ${encodeTusMetadataValue(file.name)}`,
        `filetype ${encodeTusMetadataValue(file.type || "video/mp4")}`,
      ].join(","),
    },
  });

  const location = creationResponse.getResponseHeader("Location");
  if (!location) throw new Error("Bunny TUS không trả về địa chỉ phiên upload");
  const uploadUrl = new URL(location, intent.tusEndpoint).toString();

  let offset = 0;
  while (offset < file.size) {
    const chunkEnd = Math.min(offset + TUS_CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(offset, chunkEnd);
    const chunkStart = offset;
    const patchResponse = await runTusRequest({
      method: "PATCH",
      url: uploadUrl,
      headers: {
        ...intent.tusHeaders,
        "Tus-Resumable": TUS_VERSION,
        "Upload-Offset": chunkStart,
        "Content-Type": "application/offset+octet-stream",
      },
      body: chunk,
      onProgress: (event) => {
        if (!event.lengthComputable || file.size <= 0) return;
        onProgress?.(Math.min(100, Math.round(((chunkStart + event.loaded) / file.size) * 100)));
      },
    });

    const returnedOffset = Number(patchResponse.getResponseHeader("Upload-Offset"));
    offset = Number.isFinite(returnedOffset) && returnedOffset > chunkStart
      ? returnedOffset
      : chunkEnd;
    onProgress?.(Math.min(100, Math.round((offset / file.size) * 100)));
  }
};

const VIDEO_STATUS_META = {
  missing: {
    label: "Thiếu video",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dotClass: "bg-slate-400",
  },
  uploading: {
    label: "Uploading",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
    dotClass: "bg-sky-500 animate-pulse",
  },
  processing: {
    label: "Processing",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    dotClass: "bg-amber-500 animate-pulse",
  },
  ready: {
    label: "Ready (Chưa publish)",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
    dotClass: "bg-indigo-500",
  },
  published: {
    label: "Published",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    dotClass: "bg-emerald-500",
  },
  failed: {
    label: "Encode Failed",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    dotClass: "bg-rose-500",
  },
};

const formatDuration = (seconds) => {
  const sec = Math.max(0, Math.round(Number(seconds || 0)));
  if (!sec) return "00:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const AdminVideoCoursesPage = () => {
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [courses, setCourses] = useState([]);
  const [overLimitAccounts, setOverLimitAccounts] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [courseDetail, setCourseDetail] = useState(null);

  // Profile configuration form state
  const [modeInput, setModeInput] = useState("MIRROR");
  const [sourceLiveClassIdInput, setSourceLiveClassIdInput] = useState("");
  const [thumbnailUrlInput, setThumbnailUrlInput] = useState("");
  const [deviceLimitInput, setDeviceLimitInput] = useState(2);
  const [enforceDevicesInput, setEnforceDevicesInput] = useState(true);
  const [allowFileDownloadInput, setAllowFileDownloadInput] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [publishingCourse, setPublishingCourse] = useState(false);

  // Independent curriculum builder state
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [newLessonBySection, setNewLessonBySection] = useState({});
  const [addingLessonSectionId, setAddingLessonSectionId] = useState(null);

  // Video Upload / Attach modal state
  const [uploadModalUnit, setUploadModalUnit] = useState(null); // { id, title, unitType: 'class_session' | 'lesson', replaceVideoId?: string }
  const [uploadVideoTitle, setUploadVideoTitle] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("idle"); // idle | intent | tus | attaching | done | error
  const [uploadStatusMessage, setUploadStatusMessage] = useState("");
  const [uploadAutoPublish, setUploadAutoPublish] = useState(true);

  // Content Editor Modal (Theory, Vocabulary, Formulas) for Independent / Mirror unit
  const [editorUnit, setEditorUnit] = useState(null); // { id, title, unitType, theory }
  const [editorTab, setEditorTab] = useState("theory"); // theory | vocabulary | formulas
  const [theoryTitle, setTheoryTitle] = useState("");
  const [theorySummary, setTheorySummary] = useState("");
  const [theoryHtml, setTheoryHtml] = useState("");
  const [theoryTakeaways, setTheoryTakeaways] = useState("");
  const [theoryTranscript, setTheoryTranscript] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  // Quick vocabulary form
  const [vocabTerm, setVocabTerm] = useState("");
  const [vocabPinyin, setVocabPinyin] = useState("");
  const [vocabSino, setVocabSino] = useState("");
  const [vocabMeaning, setVocabMeaning] = useState("");
  const [vocabExample, setVocabExample] = useState("");

  // Quick formula form
  const [formulaSubject, setFormulaSubject] = useState("MATH");
  const [formulaNameVi, setFormulaNameVi] = useState("");
  const [formulaNameZh, setFormulaNameZh] = useState("");
  const [formulaLatex, setFormulaLatex] = useState("");
  const [formulaDesc, setFormulaDesc] = useState("");

  const loadOverview = useCallback(async (keepCourseId = null) => {
    try {
      setLoadingOverview(true);
      const res = await fetchAdminVideoCoursesOverview();
      const list = res?.data?.courses || [];
      setCourses(list);
      setOverLimitAccounts(res?.data?.overLimitDeviceAccounts || []);
      const targetId = keepCourseId || selectedCourseId || list[0]?.id || null;
      if (targetId) {
        setSelectedCourseId(String(targetId));
      }
    } catch (error) {
      toast.error(error?.message || "Không thể tải danh sách khóa học video");
    } finally {
      setLoadingOverview(false);
    }
  }, [selectedCourseId]);

  const loadCourseDetail = useCallback(async (courseId) => {
    if (!courseId) return;
    try {
      setLoadingDetail(true);
      const res = await fetchAdminVideoCourseDetail(courseId);
      const data = res?.data;
      setCourseDetail(data);
      if (data) {
        setModeInput(data.profile?.mode || "MIRROR");
        setSourceLiveClassIdInput(data.profile?.sourceLiveClassId || data.availableLiveClasses?.[0]?.id || "");
        setThumbnailUrlInput(data.course?.thumbnailUrl || "");
        setDeviceLimitInput(Number(data.profile?.deviceLimit || 2));
        setEnforceDevicesInput(data.profile?.enforceTrustedDevices !== false);
        setAllowFileDownloadInput(data.profile?.allowFileDownload === true);
      }
    } catch (error) {
      toast.error(error?.message || "Không thể tải chi tiết khóa học video");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      loadCourseDetail(selectedCourseId);
    }
  }, [selectedCourseId, loadCourseDetail]);

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    if (!selectedCourseId) return;
    if (modeInput === "MIRROR" && !sourceLiveClassIdInput) {
      toast.error("Chế độ MIRROR bắt buộc phải chọn Lớp Live nguồn cùng khóa học");
      return;
    }

    try {
      setSavingProfile(true);
      await saveAdminVideoCourseProfile({
        courseId: Number(selectedCourseId),
        mode: modeInput,
        sourceLiveClassId: modeInput === "MIRROR" ? Number(sourceLiveClassIdInput) : null,
        deviceLimit: Number(deviceLimitInput || 2),
        enforceTrustedDevices: Boolean(enforceDevicesInput),
        allowFileDownload: Boolean(allowFileDownloadInput),
        thumbnailUrl: thumbnailUrlInput,
      });
      toast.success("Đã lưu cấu hình chế độ Khóa học Video!");
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Lỗi khi lưu cấu hình khóa học video");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePublishCourse = async (publishState) => {
    if (!selectedCourseId) return;
    try {
      setPublishingCourse(true);
      const res = await publishAdminVideoCourse(selectedCourseId, {
        isPublished: publishState,
        autoPublishReadyVideos: true,
      });
      toast.success(res?.message || (publishState ? "Đã xuất bản khóa học!" : "Đã chuyển về nháp"));
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Chưa đạt đủ 5 tiêu chí Publish Checklist");
      if (error?.details?.data?.publishChecklist && courseDetail) {
        setCourseDetail({
          ...courseDetail,
          publishChecklist: error.details.data.publishChecklist,
        });
      }
    } finally {
      setPublishingCourse(false);
    }
  };

  const handleRevokeExcessDevice = async (userId, deviceId) => {
    try {
      await revokeAdminUserTrustedDevice(userId, deviceId);
      toast.success("Đã gỡ thiết bị vượt giới hạn");
      await loadOverview(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Không thể gỡ thiết bị");
    }
  };

  // Independent Curriculum Actions
  const handleAddSection = async (e) => {
    e.preventDefault();
    if (!newSectionTitle.trim() || !selectedCourseId) return;
    try {
      setAddingSection(true);
      await createAdminVideoCourseSection(selectedCourseId, {
        title: newSectionTitle.trim(),
      });
      setNewSectionTitle("");
      toast.success("Đã tạo chương học mới");
      await loadCourseDetail(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Không thể tạo chương học");
    } finally {
      setAddingSection(false);
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!sectionId || sectionId === "unsectioned") return;
    try {
      await deleteAdminVideoCourseSection(sectionId);
      toast.success("Đã xóa chương học");
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Không thể xóa chương");
    }
  };

  const handleMoveSection = async (index, direction) => {
    const realSections = (courseDetail?.independentSections || []).filter((s) => s.id !== "unsectioned");
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= realSections.length) return;
    const next = [...realSections];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    try {
      await reorderAdminVideoCourseCurriculum(selectedCourseId, {
        sectionsOrder: next.map((s) => Number(s.id)),
      });
      await loadCourseDetail(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Không thể đổi thứ tự chương");
    }
  };

  const handleAddLesson = async (sectionId) => {
    const draft = newLessonBySection[sectionId] || {};
    const title = (draft.title || "").trim();
    if (!title) {
      toast.error("Vui lòng nhập tên bài học");
      return;
    }
    try {
      setAddingLessonSectionId(sectionId);
      await createAdminVideoCourseLesson(selectedCourseId, {
        sectionId: sectionId === "unsectioned" ? null : Number(sectionId),
        title,
        durationSeconds: Number(draft.durationMinutes || 15) * 60,
        isPublished: true,
      });
      setNewLessonBySection((prev) => ({
        ...prev,
        [sectionId]: { title: "", durationMinutes: 15 },
      }));
      toast.success("Đã thêm bài học mới");
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Không thể thêm bài học");
    } finally {
      setAddingLessonSectionId(null);
    }
  };

  const handleMoveLesson = async (section, lessonIndex, direction) => {
    const list = section.lessons || [];
    const targetIndex = lessonIndex + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(lessonIndex, 1);
    next.splice(targetIndex, 0, moved);
    try {
      await reorderAdminVideoCourseCurriculum(selectedCourseId, {
        lessonsOrder: next.map((l, idx) => ({
          id: Number(l.id),
          sectionId: section.id === "unsectioned" ? null : Number(section.id),
          sortOrder: idx,
        })),
      });
      await loadCourseDetail(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Không thể đổi thứ tự bài học");
    }
  };

  const handleDeleteLesson = async (lessonId) => {
    try {
      await deleteAdminVideoCourseLesson(lessonId);
      toast.success("Đã xóa bài học");
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Không thể xóa bài học");
    }
  };

  // Bunny Stream TUS Upload Intent & Attach Workflow
  const openUploadModal = (unit, unitType, replaceVideoId = null) => {
    setUploadModalUnit({
      id: unit.id,
      title: unit.title,
      unitType,
      replaceVideoId,
    });
    setUploadVideoTitle(unit.title || "Video bài giảng Bunny Stream");
    setUploadFile(null);
    setUploadProgress(0);
    setUploadStage("idle");
    setUploadStatusMessage("");
    setUploadAutoPublish(true);
  };

  const handleStartBunnyUpload = async (e) => {
    e.preventDefault();
    if (!uploadModalUnit || !uploadVideoTitle.trim()) return;
    if (!uploadFile) {
      toast.error("Vui lòng chọn file video cần tải lên Bunny Stream");
      return;
    }

    try {
      setUploadStage("intent");
      setUploadProgress(5);
      setUploadStatusMessage("Đang tạo phiên tải video an toàn...");

      const intentRes = await createBunnyVideoUploadIntent({
        title: uploadVideoTitle.trim(),
        fileSizeBytes: uploadFile.size,
        mimeType: uploadFile.type || "video/mp4",
      });
      const intent = intentRes?.data;
      if (!intent?.assetId) {
        throw new Error("Không nhận được assetId từ Bunny Upload Intent");
      }

      setUploadStage("tus");
      setUploadProgress(10);
      setUploadStatusMessage("Đang tải video lên kho lưu trữ...");
      await uploadFileToBunnyTus({
        file: uploadFile,
        intent,
        onProgress: (percent) => setUploadProgress(10 + Math.round(percent * 0.8)),
      });

      setUploadStage("attaching");
      setUploadProgress(92);
      setUploadStatusMessage("Video đã tải xong. Đang gắn vào buổi học...");
      if (uploadModalUnit.replaceVideoId) {
        await replaceAdminVideo(uploadModalUnit.replaceVideoId, Number(intent.assetId));
      } else {
        await attachVideoToLearningUnit(uploadModalUnit.id, {
          videoAssetId: Number(intent.assetId),
          unitType: uploadModalUnit.unitType,
          title: uploadVideoTitle.trim(),
          videoType: "primary",
          isPublished: uploadAutoPublish,
        });
      }

      setUploadProgress(100);
      setUploadStage("done");
      const successMessage = uploadModalUnit.replaceVideoId
        ? "Upload thành công! Video mới đã thay thế video cũ."
        : "Upload thành công! Video đã được gắn vào đúng buổi học.";
      setUploadStatusMessage(successMessage);
      toast.success(
        successMessage,
        { duration: 7000 },
      );
      try {
        await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
      } catch {
        toast("Video đã lên thành công nhưng danh sách chưa làm mới. Bạn có thể đóng cửa sổ rồi tải lại trang.", {
          icon: "ℹ️",
          duration: 7000,
        });
      }
    } catch (error) {
      const errorMessage = error?.message || "Không thể tải hoặc gắn video vào buổi học.";
      setUploadStage("error");
      setUploadStatusMessage(errorMessage);
      toast.error(`Upload thất bại: ${errorMessage}`, { duration: 9000 });
    }
  };

  const handleToggleVideoPublish = async (video) => {
    try {
      if (video.isPublished) {
        await unpublishAdminVideo(video.assetId);
        toast.success("Đã ẩn video (Unpublished)");
      } else {
        await publishAdminVideo(video.assetId);
        toast.success("Đã xuất bản video (Published)");
      }
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Không thể thay đổi trạng thái publish của video");
    }
  };

  const handleRemoveVideo = async (video) => {
    try {
      await deleteAdminVideo(video.assetId);
      toast.success("Đã gỡ video khỏi bài học");
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Không thể xóa video");
    }
  };

  const handleTogglePublicPreview = async (unit, unitType) => {
    try {
      const nextValue = !unit.isPublicPreview;
      const res = await updateAdminVideoCourseUnitPreview(unitType, unit.id, nextValue);
      toast.success(res?.message || (nextValue ? "Đã mở buổi học thử" : "Đã tắt buổi học thử"));
      await loadCourseDetail(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật quyền xem thử");
    }
  };

  // Unit Content Authoring Modal (Theory, Vocab, Formulas)
  const openContentEditor = (unit, unitType) => {
    setEditorUnit({
      id: unit.id,
      title: unit.title,
      unitType,
    });
    setEditorTab("theory");
    setTheoryTitle(unit.theory?.title || unit.title || "");
    setTheorySummary(unit.theory?.summary || "");
    setTheoryHtml(unit.theory?.contentHtml || "");
    setTheoryTakeaways(Array.isArray(unit.theory?.keyTakeaways) ? unit.theory.keyTakeaways.join("\n") : "");
    setTheoryTranscript(unit.theory?.transcript || "");
  };

  const handleSaveTheory = async (e) => {
    e.preventDefault();
    if (!editorUnit) return;
    try {
      setSavingContent(true);
      await saveAdminLearningUnitTheory(editorUnit.id, {
        unitType: editorUnit.unitType,
        title: theoryTitle.trim() || editorUnit.title,
        summary: theorySummary.trim(),
        contentHtml: theoryHtml,
        keyTakeaways: theoryTakeaways
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        transcript: theoryTranscript.trim(),
      });
      toast.success("Đã lưu nội dung Lý thuyết & Tóm tắt bài học!");
      await loadCourseDetail(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Lỗi khi lưu lý thuyết bài học");
    } finally {
      setSavingContent(false);
    }
  };

  const handleAddVocabulary = async (e) => {
    e.preventDefault();
    if (!editorUnit || !vocabTerm.trim() || !vocabMeaning.trim()) {
      toast.error("Vui lòng nhập từ vựng và nghĩa tiếng Việt");
      return;
    }
    try {
      setSavingContent(true);
      await createAdminLearningUnitVocabulary(editorUnit.id, {
        unitType: editorUnit.unitType,
        term: vocabTerm.trim(),
        pinyin: vocabPinyin.trim(),
        sinoVietnamese: vocabSino.trim(),
        meaning: vocabMeaning.trim(),
        exampleSentence: vocabExample.trim(),
      });
      setVocabTerm("");
      setVocabPinyin("");
      setVocabSino("");
      setVocabMeaning("");
      setVocabExample("");
      toast.success("Đã thêm từ vựng vào bài học!");
      await loadCourseDetail(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Không thể thêm từ vựng");
    } finally {
      setSavingContent(false);
    }
  };

  const handleAddFormula = async (e) => {
    e.preventDefault();
    if (!editorUnit || !formulaNameVi.trim() || !formulaLatex.trim()) {
      toast.error("Vui lòng nhập tên công thức và biểu thức LaTeX");
      return;
    }
    try {
      setSavingContent(true);
      await createAdminLearningUnitFormula(editorUnit.id, {
        unitType: editorUnit.unitType,
        subject: formulaSubject,
        nameVi: formulaNameVi.trim(),
        nameZh: formulaNameZh.trim(),
        latexExpression: formulaLatex.trim(),
        description: formulaDesc.trim(),
      });
      setFormulaNameVi("");
      setFormulaNameZh("");
      setFormulaLatex("");
      setFormulaDesc("");
      toast.success("Đã thêm công thức vào bài học!");
      await loadCourseDetail(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Không thể thêm công thức");
    } finally {
      setSavingContent(false);
    }
  };

  const checklistEntries = useMemo(() => {
    const checks = courseDetail?.publishChecklist?.checks;
    if (!checks) return [];
    return [
      { key: "hasLessons", ...checks.hasLessons },
      { key: "allRequiredVideosReady", ...checks.allRequiredVideosReady },
      { key: "hasThumbnail", ...checks.hasThumbnail },
      { key: "hasValidManagementMapping", ...checks.hasValidManagementMapping },
      { key: "entitlementSyncHealthy", ...checks.entitlementSyncHealthy },
    ];
  }, [courseDetail]);

  const passedChecksCount = useMemo(
    () => checklistEntries.filter((c) => c.passed).length,
    [checklistEntries],
  );
  const uploadBusy = ["intent", "tus", "attaching"].includes(uploadStage);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 ring-1 ring-blue-400/30">
              <FiVideo className="h-3.5 w-3.5" />
              <span>BUNNY STREAM VIDEO STUDIO • DUAL-MODE</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Quản trị Khóa Học Video & Bản Ghi
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Vận hành song song 2 mô hình: <strong className="text-white">Mode 1 (MIRROR)</strong> kế thừa giáo trình từ lớp Live nguồn và{" "}
              <strong className="text-white">Mode 2 (INDEPENDENT)</strong> xây dựng giáo trình video tự học độc lập có kiểm duyệt Publish Checklist 5 bước.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {selectedCourseId && (
              <Link
                to={`/lms/video-courses/${selectedCourseId}`}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
              >
                <FiExternalLink className="h-4 w-4" />
                <span>Mở Workspace Học viên</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                loadOverview(selectedCourseId);
                if (selectedCourseId) loadCourseDetail(selectedCourseId);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
            >
              <FiRefreshCw className={`h-4 w-4 ${loadingOverview || loadingDetail ? "animate-spin" : ""}`} />
              <span>Làm mới dữ liệu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section 5.1: Over-Limit Trusted Devices Warning Banner */}
      {overLimitAccounts.length > 0 && (
        <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Cảnh báo bảo mật thiết bị: Phát hiện {overLimitAccounts.length} tài khoản đang có hơn 2 thiết bị tin cậy
              </h3>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                Theo chính sách giới hạn 2 thiết bị/học viên, hệ thống không tự động xóa thiết bị cũ mà để Quản trị viên chủ động chọn thiết bị cần gỡ.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {overLimitAccounts.map((acc) => (
                  <div
                    key={acc.userId}
                    className="rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-800/60 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{acc.username}</span>
                        <span className="ml-2 text-xs text-slate-500">{acc.email}</span>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        {acc.activeDeviceCount}/2 thiết bị
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {acc.devices.map((dev) => (
                        <div
                          key={dev.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800"
                        >
                          <div className="truncate pr-2">
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {dev.deviceLabel || "Thiết bị trình duyệt"}
                            </span>
                            {dev.ipAddress && (
                              <span className="ml-2 font-mono text-[11px] text-slate-400">IP: {dev.ipAddress}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRevokeExcessDevice(acc.userId, dev.id)}
                            className="shrink-0 rounded-md bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-200"
                          >
                            Gỡ thiết bị
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Course Selector (Left 4 cols) + Course Studio (Right 8 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Video Course List */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Danh sách Khóa Video</h2>
                <p className="text-xs text-slate-500">Chọn khóa học để cấu hình Mirror / Independent</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                {courses.length} khóa
              </span>
            </div>

            {loadingOverview ? (
              <div className="space-y-2.5 py-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Chưa có khóa học nào trong hệ thống.</div>
            ) : (
              <div className="mt-3 max-h-[640px] space-y-2.5 overflow-y-auto pr-1">
                {courses.map((c) => {
                  const isSelected = String(c.id) === String(selectedCourseId);
                  const isIndependent = c.profile?.mode === "INDEPENDENT";
                  const checklistReady = Boolean(c.publishChecklist?.isReadyToPublish);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCourseId(String(c.id))}
                      className={`w-full rounded-2xl border p-3.5 text-left transition-all ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30"
                          : "border-slate-200/80 bg-white hover:border-blue-300 hover:bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isIndependent
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300"
                              : "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300"
                          }`}
                        >
                          {isIndependent ? "INDEPENDENT • Độc lập" : "MIRROR • Kế thừa Live"}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.isPublished
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {c.isPublished ? "Đã xuất bản" : "Bản nháp"}
                        </span>
                      </div>

                      <h3 className="mt-2 line-clamp-1 text-sm font-bold text-slate-900 dark:text-white">
                        {c.title}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          Bài học: <strong className="text-slate-700 dark:text-slate-200">{c.stats?.totalUnits || 0}</strong>
                        </span>
                        <span>
                          Video Ready:{" "}
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            {c.stats?.readyUnitsCount || 0}/{c.stats?.totalUnits || 0}
                          </strong>
                        </span>
                        <span
                          className={`font-semibold ${
                            checklistReady ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {checklistReady ? "✓ Đạt Checklist" : "• Chưa đủ Checklist"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Course Studio */}
        <div className="space-y-6 lg:col-span-8">
          {!courseDetail ? (
            <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              {loadingDetail ? "Đang tải dữ liệu cấu hình khóa học..." : "Chọn một khóa học ở cột bên trái để bắt đầu."}
            </div>
          ) : (
            <>
              {/* 1. Mode Switcher & Profile Configuration Card */}
              <form
                onSubmit={handleSaveProfile}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <FiSliders className="h-4 w-4 text-blue-600" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Cấu hình Chế độ Khóa Video: {courseDetail.course.title}
                      </h2>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Slug: <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{courseDetail.course.slug}</code>
                      {courseDetail.course.externalCourseId && (
                        <span className="ml-2">
                          • Management ID:{" "}
                          <code className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                            {courseDetail.course.externalCourseId}
                          </code>
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    <FiSave className="h-4 w-4" />
                    <span>{savingProfile ? "Đang lưu..." : "Lưu cấu hình"}</span>
                  </button>
                </div>

                {/* Mode Selector Cards */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setModeInput("MIRROR")}
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                      modeInput === "MIRROR"
                        ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30"
                        : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                        <FiCopy className="h-4 w-4" />
                        MODE 1: MIRROR (Kế thừa lớp Live)
                      </span>
                      {modeInput === "MIRROR" && <FiCheckCircle className="h-4 w-4 text-blue-600" />}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                      Kế thừa toàn bộ danh sách buổi học, tài liệu, bài tập, quiz, từ vựng và công thức từ lớp Live nguồn đã chọn.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModeInput("INDEPENDENT")}
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                      modeInput === "INDEPENDENT"
                        ? "border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20 dark:border-purple-500 dark:bg-purple-950/30"
                        : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
                        <FiLayers className="h-4 w-4" />
                        MODE 2: INDEPENDENT (Khóa video độc lập)
                      </span>
                      {modeInput === "INDEPENDENT" && <FiCheckCircle className="h-4 w-4 text-purple-600" />}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                      Không cần lớp Live. Tự tạo chương (`sections`), bài học (`lessons`), lý thuyết, tài liệu, từ vựng, công thức và video riêng.
                    </p>
                  </button>
                </div>

                {/* Configuration Fields */}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {modeInput === "MIRROR" ? (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Lớp Live nguồn kế thừa (Chỉ hiển thị lớp cùng khóa học & chưa hủy)
                      </label>
                      <select
                        value={sourceLiveClassIdInput}
                        onChange={(e) => setSourceLiveClassIdInput(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">-- Chọn lớp Live nguồn --</option>
                        {(courseDetail.availableLiveClasses || []).map((lc) => (
                          <option key={lc.id} value={lc.id}>
                            #{lc.id} — {lc.title} ({lc.sessionsCount} buổi • {lc.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Chế độ Giáo trình Độc lập (INDEPENDENT)
                      </label>
                      <div className="mt-1 flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50/50 px-3 py-2 text-xs text-purple-800 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200">
                        <FiCheckCircle className="h-4 w-4 shrink-0 text-purple-600" />
                        <span>Không phụ thuộc lớp Live (`source_live_class_id = NULL`). Quản lý chương & bài học trực tiếp bên dưới.</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Giới hạn thiết bị tin cậy / học viên
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={deviceLimitInput}
                        onChange={(e) => setDeviceLimitInput(e.target.value)}
                        className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={enforceDevicesInput}
                          onChange={(e) => setEnforceDevicesInput(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>Bắt buộc kiểm tra</span>
                      </label>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                      <input
                        type="checkbox"
                        checked={allowFileDownloadInput}
                        onChange={(e) => setAllowFileDownloadInput(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-blue-600"
                      />
                      <span>
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                          Cho phép học viên tải tài liệu xuống
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                          Tắt: tài liệu mở trong tab Chỉ xem và backend chặn tải xuống. Bật: học viên có thêm nút tải file.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      URL Ảnh đại diện khóa học (Thumbnail URL — bắt buộc trong Publish Checklist)
                    </label>
                    <input
                      type="text"
                      placeholder="https://vz-cdn.b-cdn.net/course-thumbnail.jpg"
                      value={thumbnailUrlInput}
                      onChange={(e) => setThumbnailUrlInput(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              </form>

              {/* 2. 5-Point Publish Checklist Gate (Section 9.2) */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FiShield className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Publish Checklist 5 Tiêu Chí ({passedChecksCount}/5 đạt)
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Khóa học video chỉ được phép xuất bản khi cả 5 tiêu chí kỹ thuật & đồng bộ dưới đây đều hợp lệ.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {courseDetail.course.isPublished && (
                      <button
                        type="button"
                        disabled={publishingCourse}
                        onClick={() => handlePublishCourse(false)}
                        className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Chuyển về Nháp
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={publishingCourse}
                      onClick={() => handlePublishCourse(true)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition ${
                        courseDetail.publishChecklist?.isReadyToPublish
                          ? "bg-emerald-600 hover:bg-emerald-500"
                          : "bg-amber-600 hover:bg-amber-500"
                      }`}
                    >
                      <FiCheckCircle className="h-4 w-4" />
                      <span>
                        {publishingCourse
                          ? "Đang kiểm duyệt..."
                          : courseDetail.course.isPublished
                            ? "Cập nhật & Kiểm tra lại Publish"
                            : "Kiểm duyệt & Xuất bản Khóa Video"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                  {checklistEntries.map((item) => (
                    <div
                      key={item.key}
                      className={`rounded-xl border p-3 ${
                        item.passed
                          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                          : "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {item.passed ? (
                          <FiCheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <FiXCircle className="h-4 w-4 shrink-0 text-rose-600" />
                        )}
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Mode-Specific Workspace: MIRROR vs INDEPENDENT */}
              {modeInput === "MIRROR" ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Danh sách Buổi học Kế thừa từ Lớp Live Nguồn (Read-only Lịch học)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Lịch học của lớp Live được bảo vệ (Read-only). Quản trị viên gắn video Bunny Stream, thay thế hoặc Publish từng buổi.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <FiLock className="h-3.5 w-3.5 text-slate-500" />
                      <span>Không sửa lịch lớp Live từ trang Record</span>
                    </span>
                  </div>

                  {(courseDetail.mirrorSessions || []).length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500">
                      Lớp Live nguồn chưa có buổi học nào hoặc bạn chưa chọn lớp Live nguồn.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {courseDetail.mirrorSessions.map((sess) => {
                        const statusMeta = VIDEO_STATUS_META[sess.videoStatus] || VIDEO_STATUS_META.missing;
                        const primaryVideo = sess.videos?.[0] || null;
                        return (
                          <div
                            key={sess.id}
                            className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 transition hover:border-blue-300 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-800/40"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                                  Buổi {sess.sessionNumber}
                                </span>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{sess.title}</h4>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                                  {statusMeta.label}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                <span>Lý thuyết: {sess.counts?.theory || 0}</span>
                                <span>• Tài liệu: {sess.counts?.files || 0}</span>
                                <span>• Từ vựng: {sess.counts?.vocabulary || 0}</span>
                                <span>• Công thức: {sess.counts?.formulas || 0}</span>
                                <span>• Quiz: {sess.counts?.quizzes || 0}</span>
                                {primaryVideo && (
                                  <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                                    • Bunny ID: {primaryVideo.videoId || primaryVideo.assetId} ({formatDuration(primaryVideo.durationSeconds)})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleTogglePublicPreview(sess, "class_session")}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                  sess.isPublicPreview
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                }`}
                                title="Cho mọi tài khoản xem buổi này như bài học thử"
                              >
                                {sess.isPublicPreview ? <FiEyeOff className="h-3.5 w-3.5" /> : <FiEye className="h-3.5 w-3.5" />}
                                <span>{sess.isPublicPreview ? "Tắt xem thử" : "Mở xem thử"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openContentEditor(sess, "class_session")}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <FiBookOpen className="h-3.5 w-3.5 text-blue-600" />
                                <span>Lý thuyết / Từ vựng / Công thức</span>
                              </button>

                              {!primaryVideo ? (
                                <button
                                  type="button"
                                  onClick={() => openUploadModal(sess, "class_session")}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-500"
                                >
                                  <FiUploadCloud className="h-3.5 w-3.5" />
                                  <span>Upload Bunny TUS</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openUploadModal(sess, "class_session", primaryVideo.assetId)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                  >
                                    <FiRefreshCw className="h-3.5 w-3.5" />
                                    <span>Thay video</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVideoPublish(primaryVideo)}
                                    className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white ${
                                      primaryVideo.isPublished
                                        ? "bg-amber-600 hover:bg-amber-500"
                                        : "bg-emerald-600 hover:bg-emerald-500"
                                    }`}
                                  >
                                    <FiPlay className="h-3.5 w-3.5" />
                                    <span>{primaryVideo.isPublished ? "Unpublish" : "Publish"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveVideo(primaryVideo)}
                                    className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40"
                                    title="Xóa video"
                                  >
                                    <FiTrash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Mode 2: INDEPENDENT Curriculum Builder */
                <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Giáo trình Khóa Video Độc Lập (Independent Curriculum Builder)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tạo chương (`sections`), bài học (`lessons`), sắp xếp thứ tự, tải video Bunny Stream và biên soạn Lý thuyết, Từ vựng, Công thức riêng.
                      </p>
                    </div>

                    <form onSubmit={handleAddSection} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Tên chương mới (VD: Chương 1: Nhập môn)..."
                        value={newSectionTitle}
                        onChange={(e) => setNewSectionTitle(e.target.value)}
                        className="w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={addingSection}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-purple-500 disabled:opacity-50"
                      >
                        <FiFolderPlus className="h-4 w-4" />
                        <span>Thêm Chương</span>
                      </button>
                    </form>
                  </div>

                  {(courseDetail.independentSections || []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-500 dark:border-slate-800">
                      Chưa có chương học nào. Hãy nhập tên chương và bấm <strong>Thêm Chương</strong> ở góc phải phía trên.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {courseDetail.independentSections.map((sec, secIdx) => {
                        const draftLesson = newLessonBySection[sec.id] || { title: "", durationMinutes: 15 };
                        return (
                          <div
                            key={sec.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30"
                          >
                            <div className="flex items-center justify-between border-b border-slate-200/70 pb-3 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800 dark:bg-purple-950/70 dark:text-purple-300">
                                  Chương {secIdx + 1}
                                </span>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{sec.title}</h4>
                                <span className="text-xs text-slate-400">({(sec.lessons || []).length} bài học)</span>
                              </div>

                              {sec.id !== "unsectioned" && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveSection(secIdx, -1)}
                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700"
                                    title="Đẩy chương lên"
                                  >
                                    <FiArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveSection(secIdx, 1)}
                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700"
                                    title="Đẩy chương xuống"
                                  >
                                    <FiArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSection(sec.id)}
                                    className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                    title="Xóa chương"
                                  >
                                    <FiTrash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Lessons in Section */}
                            <div className="mt-3 space-y-2.5">
                              {(sec.lessons || []).map((lesson, lIdx) => {
                                const statusMeta = VIDEO_STATUS_META[lesson.videoStatus] || VIDEO_STATUS_META.missing;
                                const primaryVideo = lesson.videos?.[0] || null;
                                return (
                                  <div
                                    key={lesson.id}
                                    className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-slate-400">
                                          #{lIdx + 1}
                                        </span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                          {lesson.title}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                                        >
                                          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                                          {statusMeta.label}
                                        </span>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                        <span>Thời lượng: {Math.round((lesson.durationSeconds || 600) / 60)} phút</span>
                                        <span>• Lý thuyết: {lesson.counts?.theory ? "Đã có" : "Chưa có"}</span>
                                        <span>• Từ vựng: {lesson.counts?.vocabulary || 0}</span>
                                        <span>• Công thức: {lesson.counts?.formulas || 0}</span>
                                        <span>• Tài liệu: {lesson.counts?.files || 0}</span>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePublicPreview(lesson, "lesson")}
                                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                                          lesson.isPublicPreview
                                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200"
                                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                        }`}
                                        title="Cho mọi tài khoản xem bài này như bài học thử"
                                      >
                                        {lesson.isPublicPreview ? <FiEyeOff className="h-3.5 w-3.5" /> : <FiEye className="h-3.5 w-3.5" />}
                                        <span>{lesson.isPublicPreview ? "Tắt xem thử" : "Mở xem thử"}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveLesson(sec, lIdx, -1)}
                                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700"
                                        title="Lên"
                                      >
                                        <FiArrowUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveLesson(sec, lIdx, 1)}
                                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700"
                                        title="Xuống"
                                      >
                                        <FiArrowDown className="h-3.5 w-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => openContentEditor(lesson, "lesson")}
                                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                      >
                                        <FiEdit3 className="h-3.5 w-3.5 text-purple-600" />
                                        <span>Biên soạn nội dung</span>
                                      </button>

                                      {!primaryVideo ? (
                                        <button
                                          type="button"
                                          onClick={() => openUploadModal(lesson, "lesson")}
                                          className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
                                        >
                                          <FiUploadCloud className="h-3.5 w-3.5" />
                                          <span>Upload Video</span>
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openUploadModal(lesson, "lesson", primaryVideo.assetId)}
                                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                          >
                                            <FiRefreshCw className="h-3.5 w-3.5" />
                                            <span>Thay video</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleToggleVideoPublish(primaryVideo)}
                                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white ${
                                              primaryVideo.isPublished
                                                ? "bg-amber-600 hover:bg-amber-500"
                                                : "bg-emerald-600 hover:bg-emerald-500"
                                            }`}
                                          >
                                            <FiPlay className="h-3.5 w-3.5" />
                                            <span>{primaryVideo.isPublished ? "Unpublish" : "Publish"}</span>
                                          </button>
                                        </>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteLesson(lesson.id)}
                                        className="rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40"
                                        title="Xóa bài học"
                                      >
                                        <FiTrash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Add Lesson Inline Row */}
                              <div className="flex flex-wrap items-center gap-2 pt-2">
                                <input
                                  type="text"
                                  placeholder="Tên bài học mới (VD: Bài 1: Phát âm chuẩn)..."
                                  value={draftLesson.title || ""}
                                  onChange={(e) =>
                                    setNewLessonBySection((prev) => ({
                                      ...prev,
                                      [sec.id]: { ...draftLesson, title: e.target.value },
                                    }))
                                  }
                                  className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={300}
                                  placeholder="Phút"
                                  value={draftLesson.durationMinutes ?? 15}
                                  onChange={(e) =>
                                    setNewLessonBySection((prev) => ({
                                      ...prev,
                                      [sec.id]: { ...draftLesson, durationMinutes: e.target.value },
                                    }))
                                  }
                                  className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                />
                                <button
                                  type="button"
                                  disabled={addingLessonSectionId === sec.id}
                                  onClick={() => handleAddLesson(sec.id)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-purple-600 dark:hover:bg-purple-500"
                                >
                                  <FiPlus className="h-3.5 w-3.5" />
                                  <span>Thêm bài học</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal 1: Bunny Stream Direct TUS Upload & Attach */}
      {uploadModalUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FiFilm className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {uploadModalUnit.replaceVideoId ? "Thay thế Video Bunny Stream" : "Upload Video Bunny Stream (TUS)"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalUnit(null)}
                disabled={uploadBusy}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800"
                title={uploadBusy ? "Vui lòng chờ quá trình upload hoàn tất" : "Đóng"}
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleStartBunnyUpload} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Đơn vị bài học
                </label>
                <div className="mt-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {uploadModalUnit.title} ({uploadModalUnit.unitType === "class_session" ? "Buổi học Mirror" : "Bài học Independent"})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tiêu đề Video trên Bunny Stream Library
                </label>
                <input
                  type="text"
                  required
                  disabled={uploadBusy || uploadStage === "done"}
                  value={uploadVideoTitle}
                  onChange={(e) => setUploadVideoTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Chọn tệp Video MP4/MOV (Tải thẳng qua giao thức TUS lên Bunny Stream)
                </label>
                <input
                  type="file"
                  required
                  disabled={uploadBusy || uploadStage === "done"}
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  disabled={uploadBusy || uploadStage === "done"}
                  checked={uploadAutoPublish}
                  onChange={(e) => setUploadAutoPublish(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Xuất bản (Publish) ngay khi video sẵn sàng</span>
              </label>

              {uploadStage !== "idle" && (
                <div className={`space-y-2 rounded-xl border p-3.5 ${
                  uploadStage === "done"
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/35"
                    : uploadStage === "error"
                      ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/35"
                      : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40"
                }`}
                >
                  <div className={`flex items-start gap-2 text-xs font-bold ${
                    uploadStage === "done"
                      ? "text-emerald-800 dark:text-emerald-200"
                      : uploadStage === "error"
                        ? "text-rose-800 dark:text-rose-200"
                        : "text-blue-800 dark:text-blue-200"
                  }`}
                  >
                    {uploadStage === "done" ? (
                      <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : uploadStage === "error" ? (
                      <FiXCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <FiRefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                    )}
                    <div className="flex-1">
                      <p>
                        {uploadStage === "done"
                          ? "Upload video thành công"
                          : uploadStage === "error"
                            ? "Upload video thất bại"
                            : "Đang upload video"}
                      </p>
                      <p className="mt-0.5 font-medium opacity-90">{uploadStatusMessage}</p>
                      {uploadStage === "done" && uploadAutoPublish && (
                        <p className="mt-1 text-[11px] font-medium opacity-80">
                          Video có thể cần thêm vài phút để xử lý chất lượng trước khi phát được.
                        </p>
                      )}
                    </div>
                    {uploadStage !== "error" && <span className="shrink-0 font-mono">{uploadProgress}%</span>}
                  </div>
                  {uploadStage !== "error" && (
                    <div className={`h-2 w-full overflow-hidden rounded-full ${
                      uploadStage === "done" ? "bg-emerald-200 dark:bg-emerald-900" : "bg-blue-200 dark:bg-blue-900"
                    }`}
                    >
                      <div
                        className={`h-full transition-all duration-300 ${uploadStage === "done" ? "bg-emerald-600" : "bg-blue-600"}`}
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalUnit(null)}
                  disabled={uploadBusy}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  {uploadStage === "done" ? "Đóng" : "Hủy"}
                </button>
                {uploadStage !== "done" && (
                  <button
                    type="submit"
                    disabled={uploadBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FiUploadCloud className="h-4 w-4" />
                    <span>{uploadStage === "error" ? "Thử upload lại" : "Tải lên & Gắn Video"}</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Unit Content Editor (Theory, Vocabulary, Formulas) */}
      {editorUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Biên soạn Học liệu Bài học: {editorUnit.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Cập nhật Lý thuyết tóm tắt, Từ vựng trọng tâm và Công thức toán/lý/hóa cho bài học.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorUnit(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              {[
                { id: "theory", label: "Lý thuyết & Transcript" },
                { id: "vocabulary", label: "Thêm Từ vựng" },
                { id: "formulas", label: "Thêm Công thức" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditorTab(t.id)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    editorTab === t.id
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {editorTab === "theory" && (
              <form onSubmit={handleSaveTheory} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tiêu đề Lý thuyết
                  </label>
                  <input
                    type="text"
                    value={theoryTitle}
                    onChange={(e) => setTheoryTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tóm tắt trọng tâm (Summary)
                  </label>
                  <textarea
                    rows={2}
                    value={theorySummary}
                    onChange={(e) => setTheorySummary(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nội dung chi tiết (HTML / Rich Text)
                  </label>
                  <textarea
                    rows={4}
                    value={theoryHtml}
                    onChange={(e) => setTheoryHtml(e.target.value)}
                    placeholder="<p>Nội dung lý thuyết chi tiết...</p>"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Key Takeaways (Mỗi dòng 1 ý chính)
                  </label>
                  <textarea
                    rows={3}
                    value={theoryTakeaways}
                    onChange={(e) => setTheoryTakeaways(e.target.value)}
                    placeholder="Nắm vững cấu trúc ngữ pháp&#10;Phân biệt bổ ngữ kết quả"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Transcript phụ đề bài giảng
                  </label>
                  <textarea
                    rows={2}
                    value={theoryTranscript}
                    onChange={(e) => setTheoryTranscript(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={savingContent}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    <FiSave className="h-4 w-4" />
                    <span>{savingContent ? "Đang lưu..." : "Lưu Lý thuyết"}</span>
                  </button>
                </div>
              </form>
            )}

            {editorTab === "vocabulary" && (
              <form onSubmit={handleAddVocabulary} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Từ vựng (Chữ Hán)</label>
                    <input
                      type="text"
                      required
                      value={vocabTerm}
                      onChange={(e) => setVocabTerm(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Pinyin</label>
                    <input
                      type="text"
                      value={vocabPinyin}
                      onChange={(e) => setVocabPinyin(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Âm Hán Việt</label>
                    <input
                      type="text"
                      value={vocabSino}
                      onChange={(e) => setVocabSino(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Nghĩa tiếng Việt</label>
                  <input
                    type="text"
                    required
                    value={vocabMeaning}
                    onChange={(e) => setVocabMeaning(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Câu ví dụ</label>
                  <input
                    type="text"
                    value={vocabExample}
                    onChange={(e) => setVocabExample(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingContent}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                  >
                    <FiPlus className="h-4 w-4" />
                    <span>Thêm Từ vựng vào Bài học</span>
                  </button>
                </div>
              </form>
            )}

            {editorTab === "formulas" && (
              <form onSubmit={handleAddFormula} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Phân môn</label>
                    <select
                      value={formulaSubject}
                      onChange={(e) => setFormulaSubject(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="MATH">Toán học (MATH)</option>
                      <option value="PHYSICS">Vật lý (PHYSICS)</option>
                      <option value="CHEMISTRY">Hóa học (CHEMISTRY)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Tên công thức (Tiếng Việt)</label>
                    <input
                      type="text"
                      required
                      value={formulaNameVi}
                      onChange={(e) => setFormulaNameVi(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Tên tiếng Trung</label>
                    <input
                      type="text"
                      value={formulaNameZh}
                      onChange={(e) => setFormulaNameZh(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Biểu thức LaTeX</label>
                  <input
                    type="text"
                    required
                    placeholder="F = m \cdot a"
                    value={formulaLatex}
                    onChange={(e) => setFormulaLatex(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Giải thích đại lượng</label>
                  <input
                    type="text"
                    value={formulaDesc}
                    onChange={(e) => setFormulaDesc(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingContent}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                  >
                    <FiPlus className="h-4 w-4" />
                    <span>Thêm Công thức vào Bài học</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminVideoCoursesPage;
