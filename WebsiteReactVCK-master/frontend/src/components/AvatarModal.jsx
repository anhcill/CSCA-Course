import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AVATAR_COUNT, DEFAULT_AVATAR_URL, handleAvatarError } from '../utils/avatar';

const AvatarModal = ({ isOpen, onClose, onSave, currentAvatarUrl, saving = false }) => {
    const { t } = useTranslation();
    const avatars = useMemo(
        () => Array.from({ length: AVATAR_COUNT }, (_, index) => `/avatar/avt_${index + 1}.webp`),
        []
    );
    const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_AVATAR_URL);

    useEffect(() => {
        if (!isOpen) return undefined;
        setSelectedAvatar(avatars.includes(currentAvatarUrl) ? currentAvatarUrl : DEFAULT_AVATAR_URL);
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !saving) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [avatars, currentAvatarUrl, isOpen, onClose, saving]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4" role="dialog" aria-modal="true" aria-labelledby="avatar-modal-title">
            <button type="button" className="absolute inset-0 cursor-default" onClick={saving ? undefined : onClose} aria-label={t('cancel')} />
            <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#f7fbfb] shadow-2xl dark:border-stone-700 dark:bg-slate-800">
                <div className="border-b border-slate-200 px-6 py-5 dark:border-stone-700">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-700 dark:text-indigo-400">个人形象</p>
                    <h2 id="avatar-modal-title" className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-50">
                        {t('choose_profile_picture')}
                    </h2>
                    {currentAvatarUrl?.startsWith('https://') && (
                        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">Ảnh Google hiện tại sẽ được thay bằng avatar bạn chọn.</p>
                    )}
                </div>
                <div className="grid flex-1 grid-cols-4 gap-3 overflow-y-auto p-5 sm:grid-cols-6 md:grid-cols-8">
                    {avatars.map((avatar, index) => {
                        const selected = selectedAvatar === avatar;
                        return (
                            <button
                                key={avatar}
                                type="button"
                                onClick={() => setSelectedAvatar(avatar)}
                                aria-pressed={selected}
                                aria-label={`Avatar ${index + 1}`}
                                className={`rounded-2xl p-1 transition focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 dark:focus:ring-offset-stone-900 ${selected ? 'bg-indigo-700 shadow-lg' : 'bg-slate-100 hover:bg-slate-200 dark:bg-stone-800 dark:hover:bg-stone-700'}`}
                            >
                                <img src={avatar} onError={handleAvatarError} alt="" className="aspect-square w-full rounded-xl object-cover" />
                            </button>
                        );
                    })}
                </div>
                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/70 px-6 py-4 sm:flex-row sm:justify-end dark:border-stone-700 dark:bg-stone-950/40">
                    <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-stone-300 px-5 py-2.5 font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-60 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">
                        {t('cancel')}
                    </button>
                    <button type="button" onClick={() => onSave(selectedAvatar)} disabled={saving || selectedAvatar === currentAvatarUrl} className="rounded-xl bg-indigo-700 px-5 py-2.5 font-semibold text-white shadow-lg shadow-indigo-900/20 hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60">
                        {saving ? 'Đang lưu…' : 'Lưu ảnh đại diện'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AvatarModal;
