/* eslint-disable react/prop-types */
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const PATH_LABELS = {
  lms: 'LMS CSCA',
  'my-learning': 'Tổng Quan',
  catalog: 'Khóa Học',
  'live-schedule': 'Lịch Live',
  assignments: 'Bài Tập & Quiz',
  assignment: 'Bài Tập',
  submit: 'Nộp Bài',
  quiz: 'Làm Quiz',
  leaderboard: 'Xếp Hạng',
  certificates: 'Chứng Chỉ',
  'teacher-hub': 'Teacher Hub',
  curriculum: 'Giáo Trình',
  grading: 'Chấm Điểm',
  admin: 'Quản Trị',
  courses: 'Khóa Học',
  lessons: 'Bài Giảng',
  exercises: 'Bài Tập',
  users: 'Người Dùng',
  posts: 'Bài Viết',
  profile: 'Hồ Sơ',
};

export default function Breadcrumbs({ customCrumbs, className = '' }) {
  const location = useLocation();

  if (customCrumbs && customCrumbs.length > 0) {
    return (
      <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-xs text-slate-400 ${className}`}>
        <Link to="/" className="flex items-center gap-1 hover:text-white transition">
          <Home className="h-3.5 w-3.5" />
        </Link>
        {customCrumbs.map((crumb, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-slate-600" />
            {crumb.path ? (
              <Link to={crumb.path} className="hover:text-white transition truncate max-w-[150px]">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-slate-200 font-semibold truncate max-w-[200px]">
                {crumb.label}
              </span>
            )}
          </div>
        ))}
      </nav>
    );
  }

  const segments = location.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-xs text-slate-400 overflow-x-auto py-1 ${className}`}>
      <Link to="/" className="flex items-center gap-1 hover:text-white transition shrink-0">
        <Home className="h-3.5 w-3.5" />
      </Link>

      {segments.map((segment, index) => {
        const path = `/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;
        const label = PATH_LABELS[segment] || decodeURIComponent(segment);

        return (
          <div key={path} className="flex items-center gap-1.5 shrink-0">
            <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
            {isLast ? (
              <span className="text-rose-300 font-bold truncate max-w-[180px]">
                {label}
              </span>
            ) : (
              <Link to={path} className="hover:text-white transition truncate max-w-[150px]">
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
