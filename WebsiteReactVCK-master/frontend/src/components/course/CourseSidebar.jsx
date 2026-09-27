import React, { useState, useEffect, useRef } from 'react';
import { FaChevronUp, FaChevronDown } from "react-icons/fa";
import { LuTvMinimalPlay } from "react-icons/lu";
import { FolderDown, BookOpen, Video } from "lucide-react";
import YouTube from 'react-youtube';
import { useAuthContext } from '../../context/AuthContext';
import useGetProgress from '../../hooks/useGetProgress';
import useGetLessons from '../../hooks/useGetLesson';
import { useTranslation } from 'react-i18next';
import TestLastCourse from './TestLastCourse';

const CourseSidebar = ({
  filteredLessons = [],
  selectedLesson,
  handleLessonSelect,
  filterProgress,
  videoDurations: initialVideoDurations,
  getYoutubeVideoId,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  openLessons,
  setOpenLessons,
  openTests,
  setOpenTests,
  toggleLessons,
  toggleTests,
  activeTab,
  setActiveTab,
}) => {
  const { t } = useTranslation();
  const { authUser } = useAuthContext();
  const { progress } = useGetProgress();
  const { lessons } = useGetLessons();
  const userProgress = progress?.find((item) => item.userId === authUser?._id);

  const [localVideoDurations, setLocalVideoDurations] = useState(initialVideoDurations || {});
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current && filteredLessons && filteredLessons.length > 0) {
      isMounted.current = true;
      const durations = {};
      const fetchDurations = async () => {
        for (const lesson of filteredLessons) {
          const videoId = getYoutubeVideoId ? getYoutubeVideoId(lesson.videoUrl) : null;
          if (videoId && !localVideoDurations[lesson._id]) {
            await new Promise(resolve => {
              const player = new YouTube(
                'youtube-player-temp',
                {
                  videoId: videoId,
                  events: {
                    'onReady': (event) => {
                      durations[lesson._id] = event.target.getDuration();
                      resolve();
                      player.destroy();
                    },
                    'onError': (event) => {
                      durations[lesson._id] = 0;
                      resolve();
                      player.destroy();
                    }
                  },
                }
              );
            });
          } else if (localVideoDurations[lesson._id]) {
            durations[lesson._id] = localVideoDurations[lesson._id];
          }
        }
        setLocalVideoDurations(prevDurations => ({ ...prevDurations, ...durations }));
      };

      fetchDurations();
    }
  }, [filteredLessons, getYoutubeVideoId, localVideoDurations]);

  const quickNav = (
    <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/60">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">Danh mục học tập</p>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => {
            if (setActiveTab) setActiveTab('introduce');
            if (setIsMobileMenuOpen) setIsMobileMenuOpen(false);
          }}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition ${
            activeTab === 'introduce' || activeTab === 'overview'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }`}
        >
          <Video className="w-4 h-4 mb-1" />
          <span>Video</span>
        </button>

        <button
          onClick={() => {
            if (setActiveTab) setActiveTab('materials');
            if (setIsMobileMenuOpen) setIsMobileMenuOpen(false);
          }}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition ${
            activeTab === 'materials'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }`}
        >
          <FolderDown className="w-4 h-4 mb-1" />
          <span>Tài liệu</span>
        </button>

        <button
          onClick={() => {
            if (setActiveTab) setActiveTab('exercises');
            if (setIsMobileMenuOpen) setIsMobileMenuOpen(false);
          }}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition ${
            activeTab === 'exercises'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }`}
        >
          <BookOpen className="w-4 h-4 mb-1" />
          <span>Bài tập</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className={`hidden lg:flex lg:w-3/12 lg:flex-col h-[calc(100vh-100px)] overflow-y-scroll scrollbar border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900`}>
        {/* Quick Nav Shortcut Tabs */}
        {quickNav}

        <div className="rounded-lg mb-2">
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            onClick={toggleLessons}
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-gray-900 dark:text-white">
                {t('courseSidebarLesson') || 'Danh Sách Video'}
              </span>
              <span className="px-2 py-0.2 rounded-full text-xs font-mono bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-amber-400">
                {filteredLessons.length}
              </span>
            </div>
            {openLessons ? <FaChevronUp className="text-gray-400 text-xs" /> : <FaChevronDown className="text-gray-400 text-xs" />}
          </div>

          <div className={`px-3 pb-3 ${openLessons ? "block" : "hidden"}`}>
            <ul className="space-y-1">
              {filteredLessons.map((lesson, index) => {
                const isSelected = selectedLesson && selectedLesson._id === lesson._id;
                const isDone = filterProgress?.some(item =>
                  item.completedLessons?.includes(lesson._id)
                );

                return (
                  <li
                    key={lesson._id}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? "bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-600 dark:text-amber-400 font-bold shadow-sm"
                        : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300"
                    }`}
                    onClick={() => handleLessonSelect(lesson)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs sm:text-sm line-clamp-2 leading-snug">
                        <span className="text-[11px] font-mono text-gray-400 mr-1">#{index + 1}</span>
                        {lesson.nameLesson || lesson.title}
                      </span>
                      {isDone && (
                        <div className="shrink-0 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex items-center text-[11px] text-gray-400 font-mono">
                      <LuTvMinimalPlay className="mr-1.5" />
                      <span>{lesson.timeVideo || 'Video bài giảng'}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Accordion Bài Test */}
        <div className="rounded-lg border-t border-gray-100 dark:border-gray-800">
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            onClick={toggleTests}
          >
            <span className="text-base font-bold text-gray-900 dark:text-white">
              {t('courseSidebarTest') || 'Bài Test Cuối Khóa'}
            </span>
            {openTests ? <FaChevronUp className="text-gray-400 text-xs" /> : <FaChevronDown className="text-gray-400 text-xs" />}
          </div>
          <div className={`px-4 pb-4 ${openTests ? "block" : "hidden"}`}>
            <TestLastCourse filteredLessons={filteredLessons} />
          </div>
        </div>
      </div>

      {/* Mobile slide-out menu */}
      <div className={`lg:hidden overflow-y-auto mt-12 pt-4 fixed top-0 right-0 h-screen w-4/5 dark:bg-gray-900 bg-white dark:text-white text-gray-900 shadow-2xl transform ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 ease-in-out z-40`}>
        <div className="p-3">
          {quickNav}

          <div className="mt-2">
            <div
              className="flex items-center justify-between p-3 cursor-pointer"
              onClick={toggleLessons}
            >
              <span className="text-base font-bold text-gray-900 dark:text-white">
                {t('courseSidebarLesson') || 'Danh Sách Video'} ({filteredLessons.length})
              </span>
              {openLessons ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
            </div>
            <div className={`px-2 pb-3 ${openLessons ? "block" : "hidden"}`}>
              <ul className="space-y-1">
                {filteredLessons.map((lesson, index) => {
                  const isSelected = selectedLesson && selectedLesson._id === lesson._id;
                  return (
                    <li
                      key={lesson._id}
                      className={`p-2.5 rounded-xl cursor-pointer text-xs sm:text-sm ${
                        isSelected
                          ? "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-amber-400 font-bold"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                      onClick={() => {
                        handleLessonSelect(lesson);
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      <span>#{index + 1} {lesson.nameLesson || lesson.title}</span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{lesson.timeVideo || 'Video bài học'}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 mt-2">
            <div
              className="flex items-center justify-between p-3 cursor-pointer"
              onClick={toggleTests}
            >
              <span className="text-base font-bold">{t('courseSidebarTest') || 'Bài Test'}</span>
              {openTests ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
            </div>
            <div className={`px-2 pb-4 ${openTests ? "block" : "hidden"}`}>
              <TestLastCourse filteredLessons={filteredLessons} />
            </div>
          </div>
        </div>
      </div>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      <div id="youtube-player-temp" style={{ display: 'none', position: 'absolute', top: '-9999px', left: '-9999px' }}></div>
    </>
  );
};

export default CourseSidebar;