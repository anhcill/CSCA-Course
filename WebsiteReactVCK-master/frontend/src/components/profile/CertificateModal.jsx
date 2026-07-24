import { useEffect, useRef, useState } from 'react';
import { FaDownload, FaSpinner, FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';

const loadImage = (source) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
        try {
            if (image.decode) await image.decode();
            resolve(image);
        } catch {
            resolve(image);
        }
    };
    image.onerror = reject;
    image.src = source;
});

const fitText = (context, text, maxWidth, initialSize, fontFamily) => {
    let size = initialSize;
    do {
        context.font = `700 ${size}px ${fontFamily}`;
        size -= 2;
    } while (size > 22 && context.measureText(text).width > maxWidth);
};

const CertificateModal = ({ certificate, studentName, onClose }) => {
    const canvasRef = useRef(null);
    const [status, setStatus] = useState('rendering');

    useEffect(() => {
        if (!certificate) return undefined;
        let cancelled = false;
        setStatus('rendering');

        loadImage('/chungchi.jpg').then((image) => {
            if (cancelled || !canvasRef.current) return;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            const safeName = String(studentName || 'Học viên CSCA').slice(0, 80);
            const safeCourse = String(certificate.courseName || '').toUpperCase().slice(0, 100);
            fitText(context, safeName, canvas.width * 0.72, 50, 'serif');
            context.fillStyle = '#0f766e';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(safeName, canvas.width / 2, canvas.height * 0.46);

            fitText(context, safeCourse, canvas.width * 0.72, 28, 'sans-serif');
            context.fillStyle = '#1c1917';
            context.fillText(safeCourse, canvas.width / 2, canvas.height * 0.61);

            context.font = '500 18px sans-serif';
            context.fillStyle = '#57534e';
            context.fillText(new Date(certificate.completedAt).toLocaleDateString('vi-VN'), canvas.width / 2, canvas.height * 0.72);
            setStatus('ready');
        }).catch(() => {
            if (!cancelled) setStatus('error');
        });

        return () => { cancelled = true; };
    }, [certificate, studentName]);

    useEffect(() => {
        const handleEscape = (event) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    if (!certificate) return null;

    const download = () => {
        if (status !== 'ready' || !canvasRef.current) return;
        canvasRef.current.toBlob((blob) => {
            if (!blob) {
                toast.error('Không thể tạo file chứng chỉ');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `certificate-${certificate.courseSlug || certificate.courseId}.png`;
            link.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4" role="dialog" aria-modal="true" aria-labelledby="certificate-title">
            <div className="w-full max-w-4xl rounded-3xl border border-cyan-300 bg-[#f7fbfb] p-5 shadow-2xl dark:border-stone-700 dark:bg-slate-800 md:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-700 dark:text-teal-400">学习成果</p><h2 id="certificate-title" className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">Chứng chỉ {certificate.courseName}</h2></div>
                    <button onClick={onClose} className="rounded-full p-3 text-stone-600 hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:text-stone-300 dark:hover:bg-stone-800" aria-label="Đóng"><FaTimes /></button>
                </div>
                <div className="relative mt-5 min-h-64 overflow-hidden rounded-2xl border border-cyan-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-900">
                    <canvas ref={canvasRef} className={`h-auto w-full rounded-xl ${status === 'ready' ? 'opacity-100' : 'opacity-20'}`} />
                    {status === 'rendering' && <div className="absolute inset-0 flex items-center justify-center gap-3 text-stone-700 dark:text-stone-200"><FaSpinner className="animate-spin" />Đang tạo chứng chỉ…</div>}
                    {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-teal-700 dark:text-teal-300">Không thể tải mẫu chứng chỉ.</div>}
                </div>
                <div className="mt-5 flex justify-end"><button onClick={download} disabled={status !== 'ready'} className="flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><FaDownload />Tải PNG</button></div>
            </div>
        </div>
    );
};

export default CertificateModal;
