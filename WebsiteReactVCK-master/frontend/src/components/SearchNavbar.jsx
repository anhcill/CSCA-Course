import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  Loader2,
  Search,
  Video,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchPublicCourseCatalog, fetchVideoCourseCatalog } from "../features/api/lmsClient";
import { buildCourseSearchResults } from "./searchCatalog";

const DEBOUNCE_MS = 220;
let publicCatalogPromise = null;
let videoCatalogPromise = null;

const loadPublicCatalog = () => {
  if (!publicCatalogPromise) {
    publicCatalogPromise = fetchPublicCourseCatalog()
      .then((response) => (Array.isArray(response?.data) ? response.data : []))
      .catch((error) => {
        publicCatalogPromise = null;
        throw error;
      });
  }
  return publicCatalogPromise;
};

const loadVideoCatalog = () => {
  if (!videoCatalogPromise) {
    videoCatalogPromise = fetchVideoCourseCatalog()
      .then((response) => (Array.isArray(response?.data) ? response.data : []))
      .catch((error) => {
        videoCatalogPromise = null;
        throw error;
      });
  }
  return videoCatalogPromise;
};

const SearchNavbar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const listboxId = useId();
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const requestSequenceRef = useRef(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerm(searchTerm.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, [location.pathname]);

  useEffect(() => {
    if (!debouncedTerm) {
      requestSequenceRef.current += 1;
      setResults([]);
      setLoading(false);
      setError("");
      setActiveIndex(-1);
      return undefined;
    }

    let cancelled = false;
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    setLoading(true);
    setError("");
    setIsOpen(true);

    Promise.all([loadPublicCatalog(), loadVideoCatalog()]).then(([courses, offerings]) => {
      if (cancelled || sequence !== requestSequenceRef.current) return;
      const nextResults = buildCourseSearchResults({ courses, offerings, query: debouncedTerm });
      setResults(nextResults);
      setActiveIndex(nextResults.length > 0 ? 0 : -1);
    }).catch((requestError) => {
      if (cancelled || sequence !== requestSequenceRef.current) return;
      setResults([]);
      setActiveIndex(-1);
      setError(requestError?.message || "Không thể tìm khóa học lúc này.");
    }).finally(() => {
      if (!cancelled && sequence === requestSequenceRef.current) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedTerm]);

  const clearSearch = () => {
    setSearchTerm("");
    setDebouncedTerm("");
    setResults([]);
    setError("");
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const openResult = (result) => {
    if (!result?.href) return;
    setSearchTerm("");
    setDebouncedTerm("");
    setResults([]);
    setIsOpen(false);
    navigate(result.href);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!isOpen || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      openResult(results[Math.max(activeIndex, 0)]);
    }
  };

  const showPanel = isOpen && Boolean(searchTerm.trim());

  return (
    <div className="relative w-full" ref={searchRef}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (results.length > 0) openResult(results[Math.max(activeIndex, 0)]);
        }}
        className="group relative"
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-red-500 dark:text-slate-500 dark:group-focus-within:text-amber-400" />
        <input
          ref={inputRef}
          type="search"
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setIsOpen(Boolean(event.target.value.trim()));
          }}
          onFocus={() => {
            if (searchTerm.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("search", { defaultValue: "Tìm kiếm khóa học..." })}
          aria-label="Tìm kiếm khóa học"
          aria-autocomplete="list"
          aria-controls={showPanel && results.length > 0 ? listboxId : undefined}
          aria-expanded={showPanel}
          aria-haspopup="listbox"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          className="peer h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-slate-100/85 pl-10 pr-10 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-500/10 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:focus:border-amber-400 dark:focus:bg-slate-900 dark:focus:ring-amber-400/10"
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-red-500 dark:text-amber-400" />
        ) : searchTerm ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Xóa từ khóa tìm kiếm"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </form>

      {showPanel && (
        <div
          className="absolute left-0 top-full z-[70] mt-2 w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-950/15 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 lg:w-[32rem]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Kết quả khóa học</span>
            {!loading && !error && (
              <span className="text-[10px] font-bold text-slate-400">{results.length} kết quả</span>
            )}
          </div>

          {error ? (
            <div className="px-5 py-7 text-center">
              <p className="text-sm font-bold text-slate-800 dark:text-white">Chưa thể tìm kiếm</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{error}</p>
            </div>
          ) : loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-5 py-8 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-red-500 dark:text-amber-400" />
              Đang tìm khóa học phù hợp...
            </div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Không tìm thấy khóa học</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Thử tên môn học, cấp độ hoặc nội dung khác.</p>
            </div>
          ) : (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Kết quả tìm kiếm khóa học"
              className="max-h-[min(26rem,65vh)] overflow-y-auto p-1.5"
            >
              {results.map((result, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={result.key}
                    id={`${listboxId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openResult(result)}
                    className={`group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition ${
                      isActive
                        ? "bg-red-50 text-red-800 dark:bg-amber-400/10 dark:text-amber-200"
                        : "text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-red-900 to-amber-500 text-white shadow-sm">
                      {result.thumbnailUrl ? (
                        <img
                          src={result.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          onError={(event) => { event.currentTarget.style.display = "none"; }}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : null}
                      {result.kind === "record" ? <Video className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                          result.kind === "record"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300"
                        }`}>
                          {result.kind === "record" ? "Khóa Record" : "Khóa học"}
                        </span>
                        {result.level && <span className="truncate text-[10px] font-semibold text-slate-400">{result.level}</span>}
                      </div>
                      <p className="mt-1 truncate text-sm font-black">{result.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {result.description || result.instructorName || "Moly Course"}
                      </p>
                    </div>

                    <ArrowUpRight className={`h-4 w-4 shrink-0 transition ${isActive ? "text-red-500 dark:text-amber-400" : "text-slate-300 group-hover:text-slate-500"}`} />
                  </button>
                );
              })}
            </div>
          )}

          {results.length > 0 && !error && (
            <div className="hidden items-center gap-3 border-t border-slate-100 px-4 py-2 text-[10px] font-semibold text-slate-400 dark:border-slate-800 sm:flex">
              <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">↑↓</kbd> chọn</span>
              <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">Enter</kbd> mở</span>
              <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">Esc</kbd> đóng</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchNavbar;
