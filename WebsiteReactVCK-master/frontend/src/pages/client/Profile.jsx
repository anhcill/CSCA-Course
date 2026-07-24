import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FaAward, FaBookOpen, FaCamera, FaCheckCircle, FaCog, FaGraduationCap,
  FaMapMarkerAlt, FaPen, FaSchool, FaUniversity, FaUser,
} from 'react-icons/fa';
import { useAuthContext } from '../../context/AuthContext';
import AvatarModal from '../../components/AvatarModal';
import ProfileSettings from '../../components/profile/ProfileSettings';
import CertificateModal from '../../components/profile/CertificateModal';
import Meta from '../../components/Meta.jsx';
import useCUDUser from '../../hooks/useCUDUser';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';

const emptyDashboard = {
  summary: { coursesStarted: 0, coursesCompleted: 0, lessonsCompleted: 0, averageProgressPct: 0 },
  learningProgress: [],
  certificates: [],
};

const programLabels = { language: 'Học tiếng', bachelor: 'Đại học', master: 'Thạc sĩ', doctorate: 'Tiến sĩ', other: 'Khác' };
const educationLabels = { high_school: 'THPT', vocational: 'Cao đẳng / nghề', undergraduate: 'Đại học', graduate: 'Sau đại học', other: 'Khác' };
const termLabels = { spring: 'Mùa xuân', fall: 'Mùa thu' };
const hskkLabels = { beginner: 'Sơ cấp', intermediate: 'Trung cấp', advanced: 'Cao cấp' };

const tabs = [
  { key: 'overview', label: 'Tổng quan', chinese: '概览', icon: FaUser },
  { key: 'courses', label: 'Khóa học', chinese: '课程', icon: FaBookOpen },
  { key: 'study-plan', label: 'Kế hoạch du học', chinese: '留学计划', icon: FaGraduationCap },
  { key: 'certificates', label: 'Chứng chỉ', chinese: '成果', icon: FaAward },
  { key: 'settings', label: 'Cài đặt', chinese: '设置', icon: FaCog },
];

const StatCard = ({ icon, value, label, accent }) => (
  <article className="rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
    <div className={`mb-4 inline-flex rounded-xl p-3 ${accent}`}>{icon}</div>
    <p className="text-3xl font-black text-stone-900 dark:text-white">{value}</p>
    <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{label}</p>
  </article>
);

const Detail = ({ icon, label, value, wide = false }) => (
  <div className={`flex gap-3 rounded-2xl border border-cyan-100 bg-white/80 p-4 dark:border-stone-700 dark:bg-stone-800/70 ${wide ? 'sm:col-span-2' : ''}`}>
    <span className="mt-1 text-teal-700 dark:text-teal-400">{icon}</span>
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-1 font-semibold text-stone-900 dark:text-stone-100">{value || 'Chưa cập nhật'}</p>
    </div>
  </div>
);

const Profile = () => {
  const { authUser } = useAuthContext();
  const { updateUserInfo, saving } = useCUDUser();
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/profile/dashboard');
      setDashboard(response.data.data || emptyDashboard);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải hành trình học tập');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const study = useMemo(() => authUser?.studentProfile || {}, [authUser?.studentProfile]);
  const displayName = study.fullName || authUser?.username || 'Học viên CSCA';
  const heroChips = useMemo(() => [
    study.targetProgram && programLabels[study.targetProgram],
    study.targetMajor,
    study.intendedIntakeTerm && study.intendedIntakeYear && `${termLabels[study.intendedIntakeTerm]} ${study.intendedIntakeYear}`,
  ].filter(Boolean), [study]);

  const saveAvatar = async (avatarUrl) => {
    try {
      await updateUserInfo({ avatarUrl });
      setAvatarOpen(false);
      toast.success('Đã cập nhật ảnh đại diện');
    } catch (avatarError) {
      toast.error(avatarError.message);
    }
  };

  if (!authUser) return null;

  return (
    <main className="min-h-screen bg-[#f4f8f7] pb-8 pt-24 text-slate-900 dark:bg-slate-900 dark:text-slate-100 md:pb-12 md:pt-28">
      <Meta title="Hồ sơ du học | CSCA Course" description="Quản lý hành trình học HSK, HSKK, CSCA và kế hoạch du học Trung Quốc." keywords="hồ sơ du học Trung Quốc, HSK, HSKK, CSCA" />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="relative overflow-hidden rounded-t-[2rem] bg-gradient-to-br from-teal-700 via-cyan-700 to-slate-800 p-6 text-white shadow-2xl shadow-teal-950/20 md:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border-[34px] border-cyan-300/10" />
          <div className="relative grid items-center gap-7 md:grid-cols-[auto_1fr]">
            <div className="relative mx-auto md:mx-0">
              <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={`Ảnh đại diện của ${displayName}`} className="h-36 w-36 rounded-full border-4 border-cyan-200 object-cover shadow-xl md:h-44 md:w-44" />
              <button onClick={() => setAvatarOpen(true)} className="absolute bottom-1 right-1 rounded-full bg-cyan-300 p-3 text-teal-950 shadow-lg hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-white" aria-label="Đổi ảnh đại diện"><FaCamera /></button>
            </div>
            <div className="text-center md:text-left">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">我的留学之路</p>
              <h1 className="mt-2 text-3xl font-black md:text-5xl">{displayName}</h1>
              <p className="mt-3 text-teal-100">Hành trình học tập và kế hoạch du học Trung Quốc của bạn</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                {heroChips.length ? heroChips.map((chip) => <span key={chip} className="rounded-full border border-cyan-200/50 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">{chip}</span>) : <span className="rounded-full border border-white/30 px-4 py-2 text-sm">Hoàn thiện kế hoạch du học để bắt đầu hành trình</span>}
              </div>
              <p className="mt-5 text-sm text-teal-100">Thành viên từ {authUser.createdAt ? new Date(authUser.createdAt).toLocaleDateString('vi-VN') : '—'} · {authUser.emailVerified ? 'Email đã xác minh' : 'Email chưa xác minh'}</p>
            </div>
          </div>
        </section>

        <nav className="overflow-x-auto border-x border-b border-slate-200 bg-slate-100 p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800" aria-label="Các mục hồ sơ">
          <div className="flex min-w-max gap-2 md:min-w-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`group flex min-w-[150px] flex-1 items-center justify-center gap-3 rounded-xl border px-5 py-3.5 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${active ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-900/20 dark:border-indigo-400 dark:bg-indigo-500 dark:text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:bg-slate-600'}`}
                >
                  <Icon className={active ? 'text-indigo-100' : 'text-slate-400 group-hover:text-indigo-500'} />
                  <span><strong className="block whitespace-nowrap text-sm">{tab.label}</strong><small className="text-xs opacity-70">{tab.chinese}</small></span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-h-[480px] rounded-b-[2rem] border-x border-b border-cyan-200 bg-white/55 p-5 shadow-lg dark:border-stone-700 dark:bg-stone-950/40 md:p-8">
          {activeTab === 'overview' && (
            <section aria-labelledby="overview-title">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-700 dark:text-teal-400">学习概览</p><h2 id="overview-title" className="mt-1 text-2xl font-black">Tổng quan học tập</h2></div>
                {error && <button onClick={loadDashboard} className="rounded-xl border border-teal-300 px-4 py-2 text-sm font-semibold text-teal-700 dark:text-teal-300">Thử lại</button>}
              </div>
              {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />)}</div>
              ) : error ? (
                <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200">{error}</div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard icon={<FaBookOpen />} value={dashboard.summary.coursesStarted} label="Khóa học đã bắt đầu" accent="bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" />
                    <StatCard icon={<FaCheckCircle />} value={dashboard.summary.coursesCompleted} label="Khóa học hoàn thành" accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" />
                    <StatCard icon={<FaGraduationCap />} value={dashboard.summary.lessonsCompleted} label="Bài học hoàn thành" accent="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" />
                    <StatCard icon={<FaAward />} value={`${dashboard.summary.averageProgressPct}%`} label="Tiến độ trung bình" accent="bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-100" />
                  </div>
                  <div className="mt-7 rounded-3xl border border-cyan-200 bg-[#fffaf0] p-6 dark:border-stone-700 dark:bg-stone-900">
                    <h3 className="text-xl font-bold">Chào mừng trở lại, {displayName}</h3>
                    <p className="mt-2 text-stone-600 dark:text-stone-400">Theo dõi tiến độ học, hoàn thiện kế hoạch du học và lưu giữ các chứng chỉ của bạn trong từng mục phía trên.</p>
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === 'courses' && (
            <section aria-labelledby="courses-title">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-700 dark:text-teal-400">在学课程</p><h2 id="courses-title" className="mt-1 text-2xl font-black">Khóa học đang học</h2></div><Link to="/courses" className="rounded-xl bg-teal-700 px-5 py-2.5 font-semibold text-white hover:bg-teal-800">Khám phá khóa học</Link></div>
              {!loading && !error && dashboard.learningProgress.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-cyan-300 p-10 text-center text-stone-600 dark:border-stone-700 dark:text-stone-400">Bạn chưa có tiến trình học. Hãy chọn khóa HSK, HSKK hoặc CSCA phù hợp.</div>
              ) : (
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {dashboard.learningProgress.map((course) => (
                    <article key={course.courseId} className="overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-800">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3"><h3 className="text-lg font-bold">{course.courseName}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${course.progressPct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-100 text-cyan-800'}`}>{course.progressPct === 100 ? 'Hoàn thành' : `${course.progressPct}%`}</span></div>
                        <progress max="100" value={course.progressPct} className="mt-5 h-2 w-full accent-teal-700" aria-label={`Tiến độ ${course.courseName}`} />
                        <div className="mt-3 flex justify-between text-sm text-stone-600 dark:text-stone-400"><span>{course.completedLessons}/{course.totalLessons} bài học</span>{course.lastLessonName && <span className="max-w-[55%] truncate">Gần nhất: {course.lastLessonName}</span>}</div>
                        {course.progressPct < 100 && <Link to={`/detail-course/${course.courseId}`} className="mt-5 inline-flex font-semibold text-teal-700 hover:underline dark:text-teal-400">Tiếp tục học →</Link>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'study-plan' && (
            <section aria-labelledby="study-plan-title">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-700 dark:text-teal-400">留学计划</p>
              <h2 id="study-plan-title" className="mt-1 text-2xl font-black">Kế hoạch du học Trung Quốc</h2>
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">Thông tin định hướng do bạn tự khai báo, không phải hồ sơ tuyển sinh chính thức.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Detail icon={<FaGraduationCap />} label="Bậc học hiện tại" value={educationLabels[study.currentEducationLevel]} />
                <Detail icon={<FaSchool />} label="Trường hiện tại" value={study.currentSchool} />
                <Detail icon={<FaUniversity />} label="Hệ / ngành mục tiêu" value={[programLabels[study.targetProgram], study.targetMajor].filter(Boolean).join(' · ')} />
                <Detail icon={<FaMapMarkerAlt />} label="Thành phố / kỳ nhập học" value={[study.targetCity, study.intendedIntakeTerm && termLabels[study.intendedIntakeTerm], study.intendedIntakeYear].filter(Boolean).join(' · ')} />
                <Detail icon={<FaBookOpen />} label="Mục tiêu HSK / HSKK" value={[study.hskLevel && `HSK ${study.hskLevel}`, study.hskkLevel && `HSKK ${hskkLabels[study.hskkLevel]}`].filter(Boolean).join(' · ')} />
                <Detail icon={<FaPen />} label="Mục tiêu" value={study.studyGoal} wide />
              </div>
              <button onClick={() => setActiveTab('settings')} className="mt-6 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800">Cập nhật kế hoạch</button>
            </section>
          )}

          {activeTab === 'certificates' && (
            <section aria-labelledby="certificates-title">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-700 dark:text-teal-400">学习成果</p>
              <h2 id="certificates-title" className="mt-1 text-2xl font-black">Chứng chỉ hoàn thành</h2>
              {dashboard.certificates.length ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {dashboard.certificates.map((certificate) => (
                    <button key={certificate.courseId} onClick={() => setSelectedCertificate(certificate)} className="flex w-full items-center gap-4 rounded-2xl border border-cyan-200 bg-[#fffaf0] p-5 text-left transition hover:border-teal-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900">
                      <span className="rounded-xl bg-cyan-100 p-4 text-cyan-700"><FaAward /></span>
                      <span><strong className="block">{certificate.courseName}</strong><small className="text-stone-500">Hoàn thành {new Date(certificate.completedAt).toLocaleDateString('vi-VN')}</small><span className="mt-2 block text-sm font-semibold text-teal-700 dark:text-teal-400">Xem và tải PNG →</span></span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-2xl border border-dashed border-cyan-300 p-10 text-center text-stone-600 dark:border-stone-700 dark:text-stone-400">Hoàn thành một khóa học để mở chứng chỉ đầu tiên.</p>
              )}
            </section>
          )}

          {activeTab === 'settings' && (
            <section aria-labelledby="settings-title">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-700 dark:text-teal-400">个人设置</p>
              <h2 id="settings-title" className="mb-6 mt-1 text-2xl font-black">Cài đặt hồ sơ</h2>
              <ProfileSettings authUser={authUser} />
            </section>
          )}
        </div>
      </div>

      <AvatarModal isOpen={avatarOpen} onClose={() => setAvatarOpen(false)} onSave={saveAvatar} currentAvatarUrl={authUser.avatarUrl} saving={saving} />
      <CertificateModal certificate={selectedCertificate} studentName={displayName} onClose={() => setSelectedCertificate(null)} />
    </main>
  );
};

export default Profile;
