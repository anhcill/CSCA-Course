import { useEffect, useState } from 'react';
import { FaGoogle, FaLock, FaSave, FaUserGraduate } from 'react-icons/fa';
import toast from 'react-hot-toast';
import useCUDUser from '../../hooks/useCUDUser';

const accountDefaults = (user) => ({
    username: user?.username || '',
    gender: user?.gender || 'other',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
});

const studyDefaults = (profile) => ({
    fullName: profile?.fullName || '',
    currentEducationLevel: profile?.currentEducationLevel || '',
    currentSchool: profile?.currentSchool || '',
    targetProgram: profile?.targetProgram || '',
    intendedIntakeYear: profile?.intendedIntakeYear || '',
    intendedIntakeTerm: profile?.intendedIntakeTerm || '',
    targetMajor: profile?.targetMajor || '',
    targetCity: profile?.targetCity || '',
    hskLevel: profile?.hskLevel || '',
    hskkLevel: profile?.hskkLevel || '',
    studyGoal: profile?.studyGoal || '',
});

const fieldClass = 'mt-2 w-full rounded-xl border border-cyan-200 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100';
const labelClass = 'text-sm font-semibold text-stone-700 dark:text-stone-200';

const ProfileSettings = ({ authUser }) => {
    const { updateUserInfo, updateStudentProfile, saving } = useCUDUser();
    const [account, setAccount] = useState(() => accountDefaults(authUser));
    const [study, setStudy] = useState(() => studyDefaults(authUser?.studentProfile));

    useEffect(() => setAccount(accountDefaults(authUser)), [authUser]);
    useEffect(() => setStudy(studyDefaults(authUser?.studentProfile)), [authUser?.studentProfile]);

    const saveAccount = async (event) => {
        event.preventDefault();
        if (account.newPassword && account.newPassword !== account.confirmPassword) {
            toast.error('Mật khẩu xác nhận không khớp');
            return;
        }
        const changes = {};
        if (account.username.trim() !== authUser.username) changes.username = account.username.trim();
        if (account.gender !== authUser.gender) changes.gender = account.gender;
        if (account.newPassword) {
            changes.currentPassword = account.currentPassword;
            changes.newPassword = account.newPassword;
        }
        if (!Object.keys(changes).length) {
            toast.error('Chưa có thay đổi nào');
            return;
        }
        try {
            await updateUserInfo(changes);
            toast.success('Đã cập nhật tài khoản');
        } catch (error) {
            toast.error(error.message);
        }
    };

    const saveStudyProfile = async (event) => {
        event.preventDefault();
        try {
            await updateStudentProfile(study);
            toast.success('Đã lưu kế hoạch du học');
        } catch (error) {
            toast.error(error.message);
        }
    };

    return (
        <div className="space-y-8">
            <form onSubmit={saveStudyProfile} className="rounded-3xl border border-cyan-200 bg-[#f7fbfb] p-6 shadow-sm dark:border-stone-700 dark:bg-slate-800 md:p-8">
                <div className="mb-6 flex items-start gap-4">
                    <span className="rounded-2xl bg-teal-100 p-3 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"><FaUserGraduate /></span>
                    <div><h2 className="text-xl font-bold text-stone-900 dark:text-white">Kế hoạch du học Trung Quốc</h2><p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Thông tin định hướng do bạn tự khai báo và có thể cập nhật bất cứ lúc nào.</p></div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                    <label className={labelClass}>Họ và tên<input className={fieldClass} value={study.fullName} maxLength={120} onChange={(e) => setStudy({ ...study, fullName: e.target.value })} /></label>
                    <label className={labelClass}>Bậc học hiện tại<select className={fieldClass} value={study.currentEducationLevel} onChange={(e) => setStudy({ ...study, currentEducationLevel: e.target.value })}><option value="">Chưa chọn</option><option value="high_school">THPT</option><option value="vocational">Cao đẳng / nghề</option><option value="undergraduate">Đại học</option><option value="graduate">Sau đại học</option><option value="other">Khác</option></select></label>
                    <label className={labelClass}>Trường hiện tại<input className={fieldClass} value={study.currentSchool} maxLength={160} onChange={(e) => setStudy({ ...study, currentSchool: e.target.value })} /></label>
                    <label className={labelClass}>Hệ dự định<select className={fieldClass} value={study.targetProgram} onChange={(e) => setStudy({ ...study, targetProgram: e.target.value })}><option value="">Chưa chọn</option><option value="language">Học tiếng</option><option value="bachelor">Đại học</option><option value="master">Thạc sĩ</option><option value="doctorate">Tiến sĩ</option><option value="other">Khác</option></select></label>
                    <label className={labelClass}>Ngành mục tiêu<input className={fieldClass} value={study.targetMajor} maxLength={120} onChange={(e) => setStudy({ ...study, targetMajor: e.target.value })} /></label>
                    <label className={labelClass}>Thành phố mục tiêu<input className={fieldClass} value={study.targetCity} maxLength={100} onChange={(e) => setStudy({ ...study, targetCity: e.target.value })} /></label>
                    <label className={labelClass}>Kỳ nhập học<select className={fieldClass} value={study.intendedIntakeTerm} onChange={(e) => setStudy({ ...study, intendedIntakeTerm: e.target.value })}><option value="">Chưa chọn</option><option value="spring">Mùa xuân</option><option value="fall">Mùa thu</option></select></label>
                    <label className={labelClass}>Năm nhập học<input type="number" min="2026" max="2040" className={fieldClass} value={study.intendedIntakeYear} onChange={(e) => setStudy({ ...study, intendedIntakeYear: e.target.value })} /></label>
                    <label className={labelClass}>HSK mục tiêu<select className={fieldClass} value={study.hskLevel} onChange={(e) => setStudy({ ...study, hskLevel: e.target.value })}><option value="">Chưa chọn</option>{Array.from({ length: 9 }, (_, index) => <option key={index + 1} value={index + 1}>HSK {index + 1}</option>)}</select></label>
                    <label className={labelClass}>HSKK mục tiêu<select className={fieldClass} value={study.hskkLevel} onChange={(e) => setStudy({ ...study, hskkLevel: e.target.value })}><option value="">Chưa chọn</option><option value="beginner">Sơ cấp</option><option value="intermediate">Trung cấp</option><option value="advanced">Cao cấp</option></select></label>
                    <label className={`${labelClass} md:col-span-2`}>Mục tiêu du học<textarea rows="4" maxLength={500} className={fieldClass} value={study.studyGoal} onChange={(e) => setStudy({ ...study, studyGoal: e.target.value })} /><span className="mt-1 block text-right text-xs font-normal text-stone-500">{study.studyGoal.length}/500</span></label>
                </div>
                <div className="mt-6 flex justify-end"><button disabled={saving} className="flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60"><FaSave />Lưu kế hoạch</button></div>
            </form>

            <form onSubmit={saveAccount} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-slate-800 md:p-8">
                <h2 className="text-xl font-bold text-stone-900 dark:text-white">Tài khoản và bảo mật</h2>
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                    <label className={labelClass}>Tên đăng nhập<input className={fieldClass} value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} /></label>
                    <label className={labelClass}>Email<input disabled className={`${fieldClass} cursor-not-allowed opacity-70`} value={authUser.email} /></label>
                    <label className={labelClass}>Giới tính<select className={fieldClass} value={account.gender} onChange={(e) => setAccount({ ...account, gender: e.target.value })}><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></label>
                </div>
                {authUser.hasPassword ? (
                    <div className="mt-7 grid gap-5 border-t border-stone-200 pt-6 dark:border-stone-700 md:grid-cols-3">
                        <label className={labelClass}>Mật khẩu hiện tại<input type="password" className={fieldClass} value={account.currentPassword} onChange={(e) => setAccount({ ...account, currentPassword: e.target.value })} /></label>
                        <label className={labelClass}>Mật khẩu mới<input type="password" className={fieldClass} value={account.newPassword} onChange={(e) => setAccount({ ...account, newPassword: e.target.value })} /></label>
                        <label className={labelClass}>Xác nhận mật khẩu<input type="password" className={fieldClass} value={account.confirmPassword} onChange={(e) => setAccount({ ...account, confirmPassword: e.target.value })} /></label>
                    </div>
                ) : (
                    <div className="mt-7 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"><FaGoogle /><span>Tài khoản này đăng nhập và được bảo vệ bằng Google.</span></div>
                )}
                <div className="mt-6 flex justify-end"><button disabled={saving} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"><FaLock />Lưu tài khoản</button></div>
            </form>
        </div>
    );
};

export default ProfileSettings;
