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
  FiSearch,
  FiShield,
  FiSliders,
  FiTrash2,
  FiUploadCloud,
  FiUsers,
  FiUserX,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import toast from "react-hot-toast";
import {
  attachVideoToLearningUnit,
  createAdminVideoCourseLesson,
  createAdminVideoCourseSection,
  createBunnyVideoUploadIntent,
  deleteAdminVideo,
  deleteAdminVideoCourseLesson,
  deleteAdminVideoCourseSection,
  fetchAdminVideoCourseDetail,
  fetchAdminVideoCourseStudents,
  fetchAdminVideoCoursesOverview,
  publishAdminVideo,
  publishAdminVideoCourse,
  reorderAdminVideoCourseCurriculum,
  replaceAdminVideo,
  revokeAdminUserTrustedDevice,
  revokeAdminVideoCourseStudentAccess,
  saveAdminVideoCourseProfile,
  unpublishAdminVideo,
  updateAdminVideoCourseUnitPreview,
} from "../../features/api/lmsClient";
import UnitContentEditorModal from "../../features/admin/components/UnitContentEditorModal";

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
    label: "Đang tải lên",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
    dotClass: "bg-sky-500 animate-pulse",
  },
  processing: {
    label: "Đang xử lý",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    dotClass: "bg-amber-500 animate-pulse",
  },
  ready: {
    label: "Sẵn sàng (chưa xuất bản)",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
    dotClass: "bg-indigo-500",
  },
  published: {
    label: "Đã xuất bản",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    dotClass: "bg-emerald-500",
  },
  failed: {
    label: "Lỗi xử lý",
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

const formatStudentDate = (value) => {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const AdminVideoCoursesPage = () => {
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [courses, setCourses] = useState([]);
  const [overLimitAccounts, setOverLimitAccounts] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [courseDetail, setCourseDetail] = useState(null);

  // Learner access is scoped to the selected video-course profile/offering.
  const [courseStudents, setCourseStudents] = useState([]);
  const [studentStats, setStudentStats] = useState({ total: 0, activeCount: 0, revokedCount: 0, onlineCount: 0 });
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [revokingStudentId, setRevokingStudentId] = useState(null);

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

  // Content Editor Modal (Theory, Files/Slides, Exercises/Quizzes, Vocabulary, Formulas)
  const [editorUnit, setEditorUnit] = useState(null); // { id, title, unitType, courseId }

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

  const loadCourseStudents = useCallback(async (courseId, profileId = null) => {
    if (!courseId) return;
    try {
      setLoadingStudents(true);
      setStudentsError("");
      const res = await fetchAdminVideoCourseStudents(courseId, profileId);
      const data = res?.data || {};
      const students = Array.isArray(data.students) ? data.students : [];
      setCourseStudents(students);
      setStudentStats({
        total: Number(data.total ?? students.length),
        activeCount: Number(data.activeCount ?? students.filter((student) => student.accessStatus === "active").length),
        revokedCount: Number(data.revokedCount ?? students.filter((student) => student.accessStatus === "revoked").length),
        onlineCount: Number(data.onlineCount ?? students.filter((student) => student.isOnline).length),
      });
    } catch (error) {
      setCourseStudents([]);
      setStudentStats({ total: 0, activeCount: 0, revokedCount: 0, onlineCount: 0 });
      setStudentsError(error?.message || "Không thể tải danh sách học viên");
    } finally {
      setLoadingStudents(false);
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

  useEffect(() => {
    const detailCourseId = courseDetail?.course?.id;
    if (selectedCourseId && String(detailCourseId) === String(selectedCourseId)) {
      loadCourseStudents(selectedCourseId, courseDetail?.profile?.id);
    }
  }, [courseDetail?.course?.id, courseDetail?.profile?.id, loadCourseStudents, selectedCourseId]);

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    if (!selectedCourseId) return;
    if (modeInput === "MIRROR" && !sourceLiveClassIdInput) {
      toast.error("Chế độ đồng bộ lớp trực tuyến cần chọn lớp nguồn cùng khóa học");
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
      toast.error(error?.message || "Chưa đạt đủ 5 tiêu chí điều kiện xuất bản");
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

  const handleRevokeStudentAccess = async (student) => {
    if (!selectedCourseId || !student?.userId || student.accessStatus === "revoked") return;
    const learnerName = student.fullName || student.username || student.email || `#${student.userId}`;
    const confirmed = window.confirm(
      `Thu hồi quyền xem khóa Video/Record của “${learnerName}”?\n\nHọc viên vẫn được giữ trong lớp Live và LMS; thao tác này chỉ chặn quyền truy cập khóa Video/Record đang chọn.`,
    );
    if (!confirmed) return;

    try {
      setRevokingStudentId(String(student.userId));
      const res = await revokeAdminVideoCourseStudentAccess(selectedCourseId, student.userId, {
        profileId: courseDetail?.profile?.id || null,
        reason: "Thu hồi thủ công từ trang quản trị khóa Video/Record",
      });
      toast.success(res?.message || "Đã thu hồi quyền xem khóa Video/Record");
      await loadCourseStudents(selectedCourseId, courseDetail?.profile?.id);
    } catch (error) {
      toast.error(error?.message || "Không thể thu hồi quyền học viên");
    } finally {
      setRevokingStudentId(null);
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
    setUploadVideoTitle(unit.title || "Video bài giảng");
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
      toast.error("Vui lòng chọn tệp video cần tải lên");
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
        toast.success("Đã ẩn video");
      } else {
        await publishAdminVideo(video.assetId);
        toast.success("Đã xuất bản video");
      }
      await Promise.all([loadOverview(selectedCourseId), loadCourseDetail(selectedCourseId)]);
    } catch (error) {
      toast.error(error?.message || "Không thể thay đổi trạng thái xuất bản của video");
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

  // Unit Content Authoring Modal (Theory, Files/Slides, Exercises/Quizzes, Vocab, Formulas)
  const openContentEditor = (unit, unitType) => {
    setEditorUnit({
      id: unit.id,
      title: unit.title,
      unitType,
      courseId: selectedCourseId,
    });
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
  const filteredCourseStudents = useMemo(() => {
    const normalizedQuery = studentQuery.trim().toLocaleLowerCase("vi");
    return courseStudents.filter((student) => {
      if (studentFilter === "online" && !student.isOnline) return false;
      if (studentFilter === "active" && student.accessStatus !== "active") return false;
      if (studentFilter === "revoked" && student.accessStatus !== "revoked") return false;
      if (!normalizedQuery) return true;
      return [student.fullName, student.username, student.email]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(normalizedQuery));
    });
  }, [courseStudents, studentFilter, studentQuery]);
  const uploadBusy = ["intent", "tus", "attaching"].includes(uploadStage);
  const cardClass =
    "rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 sm:p-5 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none";
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";

  return (
    <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
      {/* Compact Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Khóa học Video & Bản ghi
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Cấu hình khóa video đồng bộ lớp trực tuyến hoặc tự học độc lập, quản lý học viên và tải video bài giảng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedCourseId && (
            <Link
              to={`/lms/video-courses/${selectedCourseId}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
            >
              <FiExternalLink className="h-3.5 w-3.5" />
              <span>Xem trang học viên</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              loadOverview(selectedCourseId);
              if (selectedCourseId) {
                loadCourseDetail(selectedCourseId);
                loadCourseStudents(selectedCourseId, courseDetail?.profile?.id);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${loadingOverview || loadingDetail || loadingStudents ? "animate-spin" : ""}`} />
            <span>Làm mới dữ liệu</span>
          </button>
        </div>
      </div>

      {/* Over-Limit Trusted Devices Warning Banner */}
      {overLimitAccounts.length > 0 && (
        <div className="rounded-2xl sm:rounded-3xl border border-amber-200/90 bg-amber-50/85 p-4 dark:border-amber-800/80 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-black text-amber-900 dark:text-amber-200">
                Cảnh báo thiết bị: {overLimitAccounts.length} tài khoản vượt giới hạn 2 thiết bị tin cậy
              </h3>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                Chọn thiết bị cần gỡ để đảm bảo chính sách giới hạn 2 thiết bị cho mỗi học viên.
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {overLimitAccounts.map((acc) => (
                  <div
                    key={acc.userId}
                    className="rounded-2xl border border-amber-200/80 bg-white/95 p-3 dark:border-amber-800/60 dark:bg-slate-900/95"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{acc.username}</span>
                        <span className="ml-2 text-xs text-slate-500">{acc.email}</span>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        {acc.activeDeviceCount}/2 thiết bị
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {acc.devices.map((dev) => (
                        <div
                          key={dev.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800"
                        >
                          <div className="min-w-0 truncate">
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
                            className="shrink-0 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
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
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column: Video Course List */}
        <div className="min-w-0 space-y-4 lg:col-span-4">
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">Danh sách khóa video</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Chọn khóa học để cấu hình và quản lý video</p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                {courses.length} khóa
              </span>
            </div>

            {loadingOverview ? (
              <div className="space-y-2.5 py-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Chưa có khóa học nào trong hệ thống.
              </div>
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
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        isSelected
                          ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/15 dark:border-blue-500 dark:bg-blue-950/30"
                          : "border-slate-200/80 bg-slate-50/50 hover:border-blue-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                            isIndependent
                              ? "bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-sky-300"
                          }`}
                        >
                          {isIndependent ? "Khóa độc lập" : "Đồng bộ lớp trực tuyến"}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            c.isPublished
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
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
                          Sẵn sàng:{" "}
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            {c.stats?.readyUnitsCount || 0}/{c.stats?.totalUnits || 0}
                          </strong>
                        </span>
                        <span
                          className={`font-bold ${
                            checklistReady ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {checklistReady ? "Đạt điều kiện" : "Chưa đủ điều kiện"}
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
        <div className="min-w-0 space-y-5 lg:col-span-8">
          {!courseDetail ? (
            <div className={`${cardClass} flex h-64 items-center justify-center text-xs font-medium text-slate-500 dark:text-slate-400`}>
              {loadingDetail ? "Đang tải dữ liệu cấu hình khóa học..." : "Chọn một khóa học ở cột bên trái để bắt đầu."}
            </div>
          ) : (
            <>
              {/* 1. Mode Switcher & Profile Configuration Card */}
              <form onSubmit={handleSaveProfile} className={cardClass}>
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FiSliders className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />
                      <h2 className="truncate text-sm sm:text-base font-black text-slate-900 dark:text-white">
                        Cấu hình khóa video: {courseDetail.course.title}
                      </h2>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Đường dẫn:{" "}
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                          {courseDetail.course.slug}
                        </code>
                      </span>
                      {courseDetail.course.externalCourseId && (
                        <span>
                          Mã quản lý:{" "}
                          <code className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 dark:bg-blue-950/50 dark:text-sky-300">
                            {courseDetail.course.externalCourseId}
                          </code>
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    <FiSave className="h-3.5 w-3.5" />
                    <span>{savingProfile ? "Đang lưu..." : "Lưu cấu hình"}</span>
                  </button>
                </div>

                {/* Mode Selector Cards */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setModeInput("MIRROR")}
                    className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition ${
                      modeInput === "MIRROR"
                        ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/15 dark:border-blue-500 dark:bg-blue-950/30"
                        : "border-slate-200/80 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-blue-700 dark:text-sky-300">
                        <FiCopy className="h-3.5 w-3.5" />
                        Đồng bộ lớp trực tuyến
                      </span>
                      {modeInput === "MIRROR" && <FiCheckCircle className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                      Kế thừa toàn bộ danh sách buổi học, tài liệu, bài tập, trắc nghiệm, từ vựng và công thức từ lớp nguồn.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModeInput("INDEPENDENT")}
                    className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition ${
                      modeInput === "INDEPENDENT"
                        ? "border-purple-500 bg-purple-50/70 ring-2 ring-purple-500/15 dark:border-purple-500 dark:bg-purple-950/30"
                        : "border-slate-200/80 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-purple-700 dark:text-purple-300">
                        <FiLayers className="h-3.5 w-3.5" />
                        Khóa video độc lập
                      </span>
                      {modeInput === "INDEPENDENT" && <FiCheckCircle className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                      Tự tạo chương, bài học, lý thuyết, tài liệu, từ vựng, công thức và video riêng không phụ thuộc lớp trực tuyến.
                    </p>
                  </button>
                </div>

                {/* Configuration Fields */}
                <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  {modeInput === "MIRROR" ? (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Lớp trực tuyến nguồn (cùng khóa học & đang hoạt động)
                      </label>
                      <select
                        value={sourceLiveClassIdInput}
                        onChange={(e) => setSourceLiveClassIdInput(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">-- Chọn lớp nguồn --</option>
                        {(courseDetail.availableLiveClasses || []).map((lc) => (
                          <option key={lc.id} value={lc.id}>
                            #{lc.id} — {lc.title} ({lc.sessionsCount} buổi · {lc.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Chế độ giáo trình độc lập
                      </label>
                      <div className="flex items-center gap-2 rounded-xl border border-purple-200/80 bg-purple-50/50 px-3 py-2 text-xs text-purple-800 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200">
                        <FiCheckCircle className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                        <span>Không phụ thuộc lớp trực tuyến. Quản lý chương và bài học trực tiếp bên dưới.</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Giới hạn thiết bị / học viên
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={deviceLimitInput}
                        onChange={(e) => setDeviceLimitInput(e.target.value)}
                        className="w-20 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enforceDevicesInput}
                          onChange={(e) => setEnforceDevicesInput(e.target.checked)}
                          className="rounded border-slate-300 accent-blue-600"
                        />
                        <span>Bắt buộc</span>
                      </label>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="flex items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowFileDownloadInput}
                        onChange={(e) => setAllowFileDownloadInput(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 accent-blue-600"
                      />
                      <span>
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                          Cho phép học viên tải tài liệu xuống
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                          Khi tắt, học viên chỉ xem trực tuyến và không thể tải tệp về máy.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Đường dẫn ảnh đại diện khóa học (bắt buộc để xuất bản)
                    </label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={thumbnailUrlInput}
                      onChange={(e) => setThumbnailUrlInput(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </form>

              {/* 2. Learner access control for the selected Video/Record offering */}
              <div className={cardClass}>
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FiUsers className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        Danh sách học viên khóa Video/Bản ghi
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Thu hồi tại đây chỉ chặn quyền xem khóa Video/Bản ghi này, không ảnh hưởng lớp trực tuyến.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadCourseStudents(selectedCourseId, courseDetail?.profile?.id)}
                    disabled={loadingStudents}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <FiRefreshCw className={`h-3.5 w-3.5 ${loadingStudents ? "animate-spin" : ""}`} />
                    <span>Làm mới</span>
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/70">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tổng cộng</p>
                    <p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{studentStats.total}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50/80 px-3 py-2.5 dark:bg-emerald-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Đang có quyền</p>
                    <p className="mt-0.5 text-lg font-black text-emerald-700 dark:text-emerald-300">{studentStats.activeCount}</p>
                  </div>
                  <div className="rounded-2xl bg-rose-50/80 px-3 py-2.5 dark:bg-rose-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Đã thu hồi</p>
                    <p className="mt-0.5 text-lg font-black text-rose-700 dark:text-rose-300">{studentStats.revokedCount}</p>
                  </div>
                  <div className="rounded-2xl bg-blue-50/80 px-3 py-2.5 dark:bg-blue-950/30">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      Trực tuyến
                    </p>
                    <p className="mt-0.5 text-lg font-black text-blue-700 dark:text-sky-300">{studentStats.onlineCount}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1 min-w-0">
                    <FiSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={studentQuery}
                      onChange={(event) => setStudentQuery(event.target.value)}
                      placeholder="Tìm theo họ tên, tài khoản hoặc email..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {[
                      ["all", "Tất cả"],
                      ["online", `Trực tuyến (${studentStats.onlineCount})`],
                      ["active", "Có quyền"],
                      ["revoked", "Đã thu hồi"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStudentFilter(value)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                          studentFilter === value
                            ? "bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-sky-300"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Trực tuyến là tài khoản có hoạt động trong 10 phút gần nhất.</p>

                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  {loadingStudents ? (
                    <div className="space-y-2 p-3">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                      ))}
                    </div>
                  ) : studentsError ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <FiAlertTriangle className="h-6 w-6 text-amber-500" />
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{studentsError}</p>
                      <button
                        type="button"
                        onClick={() => loadCourseStudents(selectedCourseId, courseDetail?.profile?.id)}
                        className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        Thử lại
                      </button>
                    </div>
                  ) : filteredCourseStudents.length === 0 ? (
                    <div className="px-4 py-9 text-center">
                      <FiUsers className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {studentQuery.trim() ? "Không tìm thấy học viên phù hợp." : "Khóa học này chưa có học viên."}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[430px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                      {filteredCourseStudents.map((student) => {
                        const isRevoked = student.accessStatus === "revoked";
                        const isRevoking = String(revokingStudentId) === String(student.userId);
                        const displayName = student.fullName || student.username || student.email || `Học viên #${student.userId}`;
                        const sourceLabel = student.accessSource === "LIVE_MIRROR"
                          ? "Đồng bộ lớp trực tuyến"
                          : "Quyền khóa độc lập";
                        const initials = displayName.trim().slice(0, 1).toUpperCase();
                        const isOnline = Boolean(student.isOnline);

                        return (
                          <div
                            key={student.userId}
                            className={`flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                              isRevoked ? "bg-slate-50/80 opacity-75 dark:bg-slate-800/30" : "bg-white dark:bg-slate-900"
                            }`}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              {student.avatarUrl ? (
                                <img
                                  src={student.avatarUrl}
                                  alt=""
                                  className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                                  {initials}
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{displayName}</p>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      isRevoked
                                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    }`}
                                  >
                                    {isRevoked ? "Đã thu hồi" : "Đang có quyền"}
                                  </span>
                                  {isOnline && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                                      Trực tuyến
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-slate-500">{student.email || `@${student.username}`}</p>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                                  <span>{sourceLabel}</span>
                                  <span>
                                    {isOnline
                                      ? `${Number(student.activeSessions || 1)} phiên đang hoạt động`
                                      : `Hoạt động gần nhất: ${formatStudentDate(student.lastOnlineAt)}`}
                                  </span>
                                  <span>{isRevoked ? `Thu hồi: ${formatStudentDate(student.revokedAt)}` : `Cấp quyền: ${formatStudentDate(student.enrolledAt)}`}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRevokeStudentAccess(student)}
                              disabled={isRevoked || student.canRevoke === false || isRevoking}
                              title={student.canRevoke === false && !isRevoked ? "Quyền này không thể thu hồi thủ công" : undefined}
                              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                            >
                              <FiUserX className="h-3.5 w-3.5" />
                              <span>{isRevoking ? "Đang thu hồi..." : isRevoked ? "Đã thu hồi" : "Thu hồi quyền"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. 5-Point Publish Checklist Gate */}
              <div className={cardClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FiShield className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        Điều kiện xuất bản ({passedChecksCount}/5 đạt)
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Khóa học video có thể xuất bản khi cả 5 tiêu chí dưới đây đều hợp lệ.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {courseDetail.course.isPublished && (
                      <button
                        type="button"
                        disabled={publishingCourse}
                        onClick={() => handlePublishCourse(false)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Chuyển về nháp
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={publishingCourse}
                      onClick={() => handlePublishCourse(true)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm transition ${
                        courseDetail.publishChecklist?.isReadyToPublish
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-amber-600 hover:bg-amber-700"
                      }`}
                    >
                      <FiCheckCircle className="h-3.5 w-3.5" />
                      <span>
                        {publishingCourse
                          ? "Đang kiểm tra..."
                          : courseDetail.course.isPublished
                            ? "Kiểm tra & cập nhật xuất bản"
                            : "Kiểm tra & xuất bản khóa học"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                  {checklistEntries.map((item) => (
                    <div
                      key={item.key}
                      className={`rounded-2xl border p-3 ${
                        item.passed
                          ? "border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                          : "border-rose-200/80 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {item.passed ? (
                          <FiCheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <FiXCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                        )}
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Mode-Specific Workspace */}
              {modeInput === "MIRROR" ? (
                <div className={cardClass}>
                  <div className="flex flex-col gap-2.5 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                        Danh sách buổi học đồng bộ từ lớp trực tuyến
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Lịch học của lớp nguồn được bảo vệ chỉ xem. Quản trị viên tải, thay thế hoặc xuất bản video cho từng buổi.
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <FiLock className="h-3.5 w-3.5 text-slate-500" />
                      <span>Lịch học chỉ xem</span>
                    </span>
                  </div>

                  {(courseDetail.mirrorSessions || []).length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                      Lớp trực tuyến nguồn chưa có buổi học nào hoặc bạn chưa chọn lớp nguồn.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {courseDetail.mirrorSessions.map((sess) => {
                        const statusMeta = VIDEO_STATUS_META[sess.videoStatus] || VIDEO_STATUS_META.missing;
                        const primaryVideo = sess.videos?.[0] || null;
                        return (
                          <div
                            key={sess.id}
                            className="flex flex-col justify-between gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 sm:p-4 transition hover:border-blue-300 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-800/40"
                          >
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                                  Buổi {sess.sessionNumber}
                                </span>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{sess.title}</h4>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusMeta.badgeClass}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                                  {statusMeta.label}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                                <span>Lý thuyết: {sess.counts?.theory ? "Đã có" : "Chưa có"}</span>
                                <span>· Tài liệu: {sess.counts?.files || 0}</span>
                                <span>· Bài tập: {sess.counts?.assignments || 0}</span>
                                <span>· Trắc nghiệm: {sess.counts?.quizzes || 0}</span>
                                <span>· Từ vựng: {sess.counts?.vocabulary || 0}</span>
                                <span>· Công thức: {sess.counts?.formulas || 0}</span>
                                {primaryVideo && (
                                  <span className="font-mono text-[11px] text-blue-600 dark:text-sky-400">
                                    · Mã video: {primaryVideo.videoId || primaryVideo.assetId} ({formatDuration(primaryVideo.durationSeconds)})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTogglePublicPreview(sess, "class_session")}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                                  sess.isPublicPreview
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                }`}
                                title="Cho mọi tài khoản xem buổi này như bài học thử"
                              >
                                {sess.isPublicPreview ? <FiEyeOff className="h-3.5 w-3.5" /> : <FiEye className="h-3.5 w-3.5" />}
                                <span>{sess.isPublicPreview ? "Tắt xem thử" : "Mở xem thử"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openContentEditor(sess, "class_session")}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                                title="Biên soạn tài liệu, bài tập, trắc nghiệm, từ vựng và lý thuyết"
                              >
                                <FiBookOpen className="h-3.5 w-3.5" />
                                <span>Học liệu & bài tập</span>
                              </button>

                              {!primaryVideo ? (
                                <button
                                  type="button"
                                  onClick={() => openUploadModal(sess, "class_session")}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                                >
                                  <FiUploadCloud className="h-3.5 w-3.5" />
                                  <span>Tải video lên</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openUploadModal(sess, "class_session", primaryVideo.assetId)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                  >
                                    <FiRefreshCw className="h-3.5 w-3.5" />
                                    <span>Thay video</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVideoPublish(primaryVideo)}
                                    className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white ${
                                      primaryVideo.isPublished
                                        ? "bg-amber-600 hover:bg-amber-700"
                                        : "bg-emerald-600 hover:bg-emerald-700"
                                    }`}
                                  >
                                    <FiPlay className="h-3.5 w-3.5" />
                                    <span>{primaryVideo.isPublished ? "Ẩn video" : "Xuất bản"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveVideo(primaryVideo)}
                                    className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400"
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
                /* Mode 2: Independent Curriculum Builder */
                <div className={`${cardClass} space-y-4`}>
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                        Giáo trình khóa video độc lập
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Tạo chương, bài học, sắp xếp thứ tự, tải video và biên soạn học liệu riêng cho khóa học.
                      </p>
                    </div>

                    <form onSubmit={handleAddSection} className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        placeholder="Tên chương mới (VD: Chương 1: Nhập môn)..."
                        value={newSectionTitle}
                        onChange={(e) => setNewSectionTitle(e.target.value)}
                        className="w-full sm:w-64 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        disabled={addingSection}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        <FiFolderPlus className="h-3.5 w-3.5" />
                        <span>Thêm chương</span>
                      </button>
                    </form>
                  </div>

                  {(courseDetail.independentSections || []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      Chưa có chương học nào. Nhập tên chương và bấm <strong>Thêm chương</strong> ở góc trên.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {courseDetail.independentSections.map((sec, secIdx) => {
                        const draftLesson = newLessonBySection[sec.id] || { title: "", durationMinutes: 15 };
                        return (
                          <div
                            key={sec.id}
                            className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-800/30"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3 dark:border-slate-700">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 rounded-lg bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 dark:bg-purple-950/70 dark:text-purple-300">
                                  Chương {secIdx + 1}
                                </span>
                                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{sec.title}</h4>
                                <span className="shrink-0 text-xs text-slate-400">({(sec.lessons || []).length} bài)</span>
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
                                    className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900"
                                  >
                                    <div className="min-w-0 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-slate-400">
                                          #{lIdx + 1}
                                        </span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                          {lesson.title}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusMeta.badgeClass}`}
                                        >
                                          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                                          {statusMeta.label}
                                        </span>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                                        <span className="font-medium text-slate-600 dark:text-slate-400">
                                          {Math.round((lesson.durationSeconds || 600) / 60)} phút
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-600">·</span>
                                        <span
                                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium ${
                                            lesson.counts?.theory
                                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          Lý thuyết: {lesson.counts?.theory ? "Đã có" : "0"}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium ${
                                            (lesson.counts?.files || 0) > 0
                                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-sky-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          Tài liệu: {lesson.counts?.files || 0}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium ${
                                            (lesson.counts?.assignments || 0) > 0
                                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          Bài tập: {lesson.counts?.assignments || 0}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium ${
                                            (lesson.counts?.quizzes || 0) > 0
                                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          Trắc nghiệm: {lesson.counts?.quizzes || 0}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium ${
                                            (lesson.counts?.vocabulary || 0) > 0
                                              ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          Từ vựng: {lesson.counts?.vocabulary || 0}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium ${
                                            (lesson.counts?.formulas || 0) > 0
                                              ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          Công thức: {lesson.counts?.formulas || 0}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePublicPreview(lesson, "lesson")}
                                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                                          lesson.isPublicPreview
                                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200"
                                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                        }`}
                                        title="Cho mọi tài khoản xem bài này như bài học thử"
                                      >
                                        {lesson.isPublicPreview ? <FiEyeOff className="h-3.5 w-3.5" /> : <FiEye className="h-3.5 w-3.5" />}
                                        <span>{lesson.isPublicPreview ? "Tắt xem thử" : "Mở xem thử"}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveLesson(sec, lIdx, -1)}
                                        className="rounded-xl border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                                        title="Đẩy lên"
                                      >
                                        <FiArrowUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveLesson(sec, lIdx, 1)}
                                        className="rounded-xl border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                                        title="Đẩy xuống"
                                      >
                                        <FiArrowDown className="h-3.5 w-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => openContentEditor(lesson, "lesson")}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-300"
                                        title="Biên soạn lý thuyết, tài liệu, bài tập, trắc nghiệm, từ vựng và công thức"
                                      >
                                        <FiEdit3 className="h-3.5 w-3.5" />
                                        <span>Học liệu & bài tập</span>
                                      </button>

                                      {!primaryVideo ? (
                                        <button
                                          type="button"
                                          onClick={() => openUploadModal(lesson, "lesson")}
                                          className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                                        >
                                          <FiUploadCloud className="h-3.5 w-3.5" />
                                          <span>Tải video lên</span>
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openUploadModal(lesson, "lesson", primaryVideo.assetId)}
                                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                          >
                                            <FiRefreshCw className="h-3.5 w-3.5" />
                                            <span>Thay video</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleToggleVideoPublish(primaryVideo)}
                                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white ${
                                              primaryVideo.isPublished
                                                ? "bg-amber-600 hover:bg-amber-700"
                                                : "bg-emerald-600 hover:bg-emerald-700"
                                            }`}
                                          >
                                            <FiPlay className="h-3.5 w-3.5" />
                                            <span>{primaryVideo.isPublished ? "Ẩn video" : "Xuất bản"}</span>
                                          </button>
                                        </>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteLesson(lesson.id)}
                                        className="rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-400"
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
                                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                                  className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                />
                                <button
                                  type="button"
                                  disabled={addingLessonSectionId === sec.id}
                                  onClick={() => handleAddLesson(sec.id)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
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

      {/* Modal 1: Direct Video Upload & Attach */}
      {uploadModalUnit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                <FiFilm className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />
                <h3 className="truncate text-base font-black text-slate-900 dark:text-white">
                  {uploadModalUnit.replaceVideoId ? "Thay thế video bài giảng" : "Tải video bài giảng"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalUnit(null)}
                disabled={uploadBusy}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                title={uploadBusy ? "Vui lòng chờ quá trình tải lên hoàn tất" : "Đóng"}
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleStartBunnyUpload} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Đơn vị bài học
                </label>
                <div className="rounded-xl bg-slate-100/80 px-3 py-2 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {uploadModalUnit.title} ({uploadModalUnit.unitType === "class_session" ? "Buổi học đồng bộ" : "Bài học độc lập"})
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tiêu đề video
                </label>
                <input
                  type="text"
                  required
                  disabled={uploadBusy || uploadStage === "done"}
                  value={uploadVideoTitle}
                  onChange={(e) => setUploadVideoTitle(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn tệp video (MP4, MOV, WebM, MKV)
                </label>
                <input
                  type="file"
                  required
                  disabled={uploadBusy || uploadStage === "done"}
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={uploadBusy || uploadStage === "done"}
                  checked={uploadAutoPublish}
                  onChange={(e) => setUploadAutoPublish(e.target.checked)}
                  className="rounded border-slate-300 accent-blue-600"
                />
                <span>Tự động xuất bản ngay khi video xử lý xong</span>
              </label>

              {uploadStage !== "idle" && (
                <div
                  className={`space-y-2 rounded-2xl border p-3.5 ${
                    uploadStage === "done"
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/35"
                      : uploadStage === "error"
                        ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/35"
                        : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40"
                  }`}
                >
                  <div
                    className={`flex items-start gap-2 text-xs font-bold ${
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
                    <div className="min-w-0 flex-1">
                      <p>
                        {uploadStage === "done"
                          ? "Tải video thành công"
                          : uploadStage === "error"
                            ? "Tải video thất bại"
                            : "Đang tải video lên"}
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
                    <div
                      className={`h-2 w-full overflow-hidden rounded-full ${
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

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setUploadModalUnit(null)}
                  disabled={uploadBusy}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                >
                  {uploadStage === "done" ? "Đóng" : "Hủy"}
                </button>
                {uploadStage !== "done" && (
                  <button
                    type="submit"
                    disabled={uploadBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition"
                  >
                    <FiUploadCloud className="h-3.5 w-3.5" />
                    <span>{uploadStage === "error" ? "Thử tải lại" : "Tải lên & gắn video"}</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Unit Content Editor (Theory, Files/Slides, Exercises/Quizzes, Vocabulary, Formulas) */}
      <UnitContentEditorModal
        isOpen={Boolean(editorUnit)}
        unit={editorUnit}
        onClose={() => setEditorUnit(null)}
        onContentUpdated={() => {
          loadOverview(selectedCourseId);
          if (selectedCourseId) loadCourseDetail(selectedCourseId);
        }}
      />
    </div>
  );
};

export default AdminVideoCoursesPage;
