/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AVATAR_COUNT, DEFAULT_AVATAR_URL, handleAvatarError } from '../utils/avatar';
import { uploadImageToR2 } from '../features/api/lmsClient';

const AvatarModal = ({ isOpen, onClose, onSave, currentAvatarUrl, saving = false }) => {
    const { t } = useTranslation();
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const avatars = useMemo(
        () => Array.from({ length: AVATAR_COUNT }, (_, index) => `/avatar/avt_${index + 1}.webp`),
        []
    );
    const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_AVATAR_URL);

    useEffect(() => {
        if (!isOpen) return undefined;
        setSelectedAvatar(currentAvatarUrl || DEFAULT_AVATAR_URL);
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !saving && !uploading) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [avatars, currentAvatarUrl, isOpen, onClose, saving, uploading]);

    const handleCustomFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Vui lòng chọn tệp hình ảnh (JPG, PNG, WEBP, GIF, SVG)');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Kích thước ảnh không được vượt quá 10MB');
            return;
        }
        try {
            setUploading(true);
            const result = await uploadImageToR2(file, {
                folder: 'avatars',
                onProgress: (p) => setUploadProgress(p),
            });
            setSelectedAvatar(result.publicUrl);
            toast.success('Đã tải ảnh lên Cloudflare thành công! Nhấn "Lưu ảnh đại diện" để hoàn tất.');
        } catch (err) {
            console.error('Lỗi tải ảnh đại diện lên Cloudflare:', err);
            toast.error(err.message || 'Không thể tải ảnh lên Cloudflare');
        } finally {
            setUploading(false);
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4" role="dialog" aria-modal="true" aria-labelledby="avatar-modal-title">
            <button type="button" className="absolute inset-0 cursor-default" onClick={saving ? undefined : onClose} aria-label={t('cancel')} />
            <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#f7fbfb] shadow-2xl dark:border-stone-700 dark:bg-slate-800">
                <div className="border-b border-slate-200 px-6 py-4 dark:border-stone-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-700 dark:text-indigo-400">个人形象</p>
                        <h2 id="avatar-modal-title" className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-50">
                            {t('choose_profile_picture')}
                        </h2>
                    </div>
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            onChange={handleCustomFileUpload}
                            className="hidden"
                            disabled={uploading || saving}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading || saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60"
                        >
                            <span>☁️</span>
                            <span>{uploading ? 'Đang tải lên Cloudflare…' : 'Tải ảnh từ máy tính'}</span>
                        </button>
                    </div>
                </div>

                {uploadProgress && (
                    <div className="bg-sky-50 dark:bg-sky-950/40 border-b border-sky-200 dark:border-sky-800 px-6 py-2.5 flex items-center justify-between gap-4 text-xs font-medium text-sky-800 dark:text-sky-200">
                        <span>{uploadProgress.message || 'Đang tải ảnh lên Cloudflare…'}</span>
                        <div className="flex items-center gap-2">
                            <div className="w-24 h-2 rounded-full bg-sky-200 dark:bg-sky-800 overflow-hidden">
                                <div className="h-full bg-sky-600 transition-all duration-200" style={{ width: `${uploadProgress.percent}%` }} />
                            </div>
                            <span className="font-mono font-bold">{uploadProgress.percent}%</span>
                        </div>
                    </div>
                )}

                <div className="grid flex-1 grid-cols-4 gap-3 overflow-y-auto p-5 sm:grid-cols-6 md:grid-cols-8">
                    {!avatars.includes(selectedAvatar) && selectedAvatar && (
                        <button
                            type="button"
                            onClick={() => setSelectedAvatar(selectedAvatar)}
                            aria-pressed={true}
                            aria-label="Ảnh đại diện tùy chỉnh"
                            className="rounded-2xl p-1 transition focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 dark:focus:ring-offset-stone-900 bg-indigo-700 shadow-lg relative col-span-1"
                        >
                            <img src={selectedAvatar} onError={handleAvatarError} alt="" className="aspect-square w-full rounded-xl object-cover" />
                            <span className="absolute bottom-1 right-1 rounded-full bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5">Mới</span>
                        </button>
                    )}
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
