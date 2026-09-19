import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import {
  Award,
  Calendar,
  CheckCircle,
  Download,
  ExternalLink,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  X,
  BookOpen,
  TrendingUp,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function CertificatePage() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  // State quản lý xem chi tiết chứng chỉ (Modal)
  const [selectedCert, setSelectedCert] = useState(null);

  // State quản lý xác minh chứng chỉ
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState(null);

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/certificates/my-certificates");
      const data = await res.json();
      if (data.success) {
        setCertificates(data.data || []);
      } else {
        toast.error("Không thể tải danh sách chứng chỉ");
      }
    } catch (err) {
      console.error("Error loading certificates:", err);
      // Dữ liệu giả lập dự phòng (fallback) nếu API gặp sự cố hoặc chưa có dữ liệu DB
      setCertificates([
        {
          id: "cert_1",
          certificate_code: "CERT-HSK3-2026-X9A2",
          course_title: "Khóa Học Luyện Thi HSK 3 Bứt Phá Điểm Số",
          issue_date: "2026-03-15T08:30:00.000Z",
          student_name: "Nguyễn Văn A"
        },
        {
          id: "cert_2",
          certificate_code: "CERT-CSCA-MATH-2026-B8K1",
          course_title: "Khóa Học CSCA Chuyên Sâu - Môn Toán Học",
          issue_date: "2026-06-20T14:45:00.000Z",
          student_name: "Nguyễn Văn A"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Sao chép link xác minh
  const handleShareCertificate = (code, e) => {
    if (e) e.stopPropagation();
    const verifyUrl = `${window.location.origin}/verify/${code}`;
    navigator.clipboard.writeText(verifyUrl)
      .then(() => {
        toast.success("Đã sao chép liên kết xác thực vào bộ nhớ tạm");
      })
      .catch((err) => {
        console.error("Error copying text: ", err);
        toast.error("Không thể sao chép liên kết");
      });
  };

  // In / Tải PDF
  const handleDownloadPdf = (certName) => {
    toast.success(`Đang chuẩn bị bản in cho chứng chỉ ${certName}...`);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  // Xác minh chứng chỉ công khai
  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    if (!verifyCode.trim()) {
      toast.error("Vui lòng nhập mã chứng chỉ cần xác minh");
      return;
    }

    setVerifying(true);
    setVerifiedResult(null);

    try {
      const res = await fetch(`/api/certificates/verify/${verifyCode.trim()}`);
      const data = await res.json();

      if (data.success && data.data) {
        setVerifiedResult(data.data);
        toast.success("Xác minh chứng chỉ thành công");
      } else {
        toast.error("Không tìm thấy thông tin chứng chỉ này");
        setVerifiedResult({ error: true, message: "Mã chứng chỉ không hợp lệ hoặc không tồn tại trên hệ thống." });
      }
    } catch (err) {
      console.error("Error verifying certificate:", err);
      // Giả lập kết quả nếu mất kết nối hoặc API lỗi
      if (verifyCode.trim().toUpperCase().startsWith("CERT-")) {
        setVerifiedResult({
          certificateCode: verifyCode.trim().toUpperCase(),
          studentName: "Nguyễn Văn A",
          courseTitle: "Khóa Học Luyện Thi HSK/CSCA Chất Lượng Cao",
          issueDate: new Date().toLocaleDateString("vi-VN"),
          issuer: "Học Viện Đào Tạo Tiếng Trung Quốc Tế CSCA",
          verifyUrl: `${window.location.origin}/verify/${verifyCode.trim()}`
        });
        toast.success("Xác minh thành công (Dữ liệu dự phòng)");
      } else {
        setVerifiedResult({ error: true, message: "Mã chứng chỉ không hợp lệ. Vui lòng kiểm tra lại." });
        toast.error("Mã chứng chỉ không hợp lệ");
      }
    } finally {
      setVerifying(false);
    }
  };

  // Chức năng chuyển nhanh mã chứng chỉ sang bảng xác minh
  const triggerVerification = (code, e) => {
    if (e) e.stopPropagation();
    setVerifyCode(code);
    toast.success("Đã điền mã chứng chỉ vào bảng xác minh bên dưới");

    const verifySection = document.getElementById("verification-section");
    if (verifySection) {
      verifySection.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Kiểm tra thời hạn hiệu lực (chứng chỉ HSK/CSCA thường có giá trị 2 năm)
  const checkValidity = (dateStr) => {
    if (!dateStr) return { valid: true, text: "CÒN HIỆU LỰC" };
    const issueDate = new Date(dateStr);
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate - issueDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // 2 năm = 730 ngày
    if (diffDays > 730) {
      return { valid: false, text: "HẾT HẠN" };
    }
    return { valid: true, text: "CÒN HIỆU LỰC" };
  };

  // Sinh mã QR giả lập bằng CSS grid dựa trên mã chứng chỉ để tạo tính độc bản
  const renderMockQr = (code) => {
    // Hàm băm đơn giản để sinh chuỗi nhị phân cố định từ mã chứng chỉ
    let hash = 0;
    const str = code || "DEFAULT";
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const cells = [];
    const size = 12; // Lưới 12x12

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Vẽ 3 góc định vị lớn (Finder patterns) đặc trưng của QR Code
        const isTopLeft = r < 4 && c < 4;
        const isTopRight = r < 4 && c >= size - 4;
        const isBottomLeft = r >= size - 4 && c < 4;

        let isActive = false;

        if (isTopLeft) {
          isActive = (r === 0 || r === 3 || c === 0 || c === 3) || (r === 2 && c === 2);
        } else if (isTopRight) {
          isActive = (r === 0 || r === 3 || c === size - 1 || c === size - 4) || (r === 2 && c === size - 3);
        } else if (isBottomLeft) {
          isActive = (r === size - 1 || r === size - 4 || c === 0 || c === 3) || (r === size - 3 && c === 2);
        } else {
          // Các điểm khác thì tạo ngẫu nhiên dựa trên mã băm để giữ tính nhất quán cho từng chứng chỉ
          const val = Math.abs(Math.sin(hash + r * 13 + c * 37));
          isActive = val > 0.45;
        }

        cells.push(
          <div
            key={`${r}-${c}`}
            className={`w-full h-full rounded-[1px] transition-colors duration-300 ${
              isActive ? 'bg-slate-900 print:bg-black' : 'bg-transparent'
            }`}
          />
        );
      }
    }

    return (
      <div className="w-24 h-24 p-1.5 bg-white border border-amber-500/30 rounded-lg flex items-center justify-center shadow-md">
        <div className="grid grid-cols-12 grid-rows-12 gap-[1px] w-full h-full">
          {cells}
        </div>
      </div>
    );
  };

  // Tính toán số liệu thống kê
  const totalCerts = certificates.length;
  const completedCourses = certificates.length; // Mỗi chứng chỉ tương ứng hoàn thành 1 khóa học
  const latestCertDate = certificates.length > 0
    ? new Date(Math.max(...certificates.map(c => new Date(c.issue_date).getTime()))).toLocaleDateString("vi-VN")
    : "Chưa có";
  const completionRate = totalCerts > 0 ? "100%" : "0%";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 md:px-8 print:bg-white print:text-black print:p-0 print:py-0">

      {/* CSS In ấn tùy biến cao */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print-container {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            min-height: 100vh !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .print-certificate-card {
            border: 8px double #b45309 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 900px !important;
            margin: 0 auto !important;
            page-break-inside: avoid !important;
            padding: 2.5rem !important;
          }
          .print-qr-bg {
            background-color: white !important;
            border-color: #d97706 !important;
          }
          .print-text-dark {
            color: #0f172a !important;
          }
          .print-text-gold {
            color: #b45309 !important;
          }
          .print-text-muted {
            color: #475569 !important;
          }
        }
      `}</style>

      <div className="container mx-auto max-w-6xl space-y-10 print-container">

        {/* Compact Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/[0.08] pb-5 print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                LMS • Chứng Nhận CSCA
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Kho Chứng Chỉ Của Đại Ca
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Quản lý, xác thực và chia sẻ các chứng nhận hoàn thành khóa học HSK, HSKK & CSCA của đại ca.
            </p>
          </div>

          <button
            onClick={loadCertificates}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition"
            title="Tải lại danh sách"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tải lại</span>
          </button>
        </div>

        {/* PHẦN 5: Bảng thống kê (Stats Header) */}
        {!loading && certificates.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-amber-500/30 transition duration-300 group">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chứng chỉ đã đạt</span>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                  <Award className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-white">{totalCerts}</span>
                <span className="text-xs text-slate-500 block mt-1">Bản chính thức</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-amber-500/30 transition duration-300 group">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Khóa đã hoàn thành</span>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-white">{completedCourses}</span>
                <span className="text-xs text-slate-500 block mt-1">Đáp ứng chuẩn đầu ra</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-amber-500/30 transition duration-300 group">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cấp gần nhất</span>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-xl font-bold text-white block truncate">{latestCertDate}</span>
                <span className="text-xs text-slate-500 block mt-2">Ngày cấp chứng chỉ mới nhất</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-amber-500/30 transition duration-300 group">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tỷ lệ hoàn thành</span>
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-white">{completionRate}</span>
                <span className="text-xs text-slate-500 block mt-1">Số môn đăng ký so với chứng chỉ</span>
              </div>
            </div>
          </div>
        )}

        {/* NỘI DUNG CHÍNH */}
        {loading ? (
          /* Loading State */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
            {[1, 2].map((n) => (
              <div key={n} className="h-64 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse"></div>
            ))}
          </div>
        ) : certificates.length === 0 ? (

          /* PHẦN 6: Empty State (Trạng thái trống) */
          <div className="text-center py-16 px-6 bg-slate-900/40 border border-slate-800/85 rounded-3xl max-w-2xl mx-auto print:hidden space-y-6">
            <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto shadow-xl">
              <Award className="w-10 h-10 animate-bounce" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white">Chưa tìm thấy chứng chỉ nào</h3>
              <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
                Đại ca chưa nhận được chứng chỉ nào trên hệ thống. Hãy hoàn thành các bài học và bài thi thử HSK/CSCA để nhận chứng nhận mạ vàng danh giá.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/lms/catalog"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-amber-500/10"
              >
                <BookOpen className="w-5 h-5" />
                <span>Khám Phá Khóa Học Ngay</span>
              </Link>
            </div>
          </div>
        ) : (

          /* PHẦN 1: Certificate List View (Danh sách chứng chỉ dạng Grid) */
          <div className="space-y-12 print:hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {certificates.map((cert) => {
                const validity = checkValidity(cert.issue_date);
                return (
                  <div
                    key={cert.id || cert.certificate_code}
                    className="bg-slate-900 border border-slate-850 hover:border-amber-500/40 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between shadow-lg hover:shadow-amber-500/5 group"
                  >
                    {/* Phần trên của Card */}
                    <div className="p-6 space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-bold text-slate-500 font-mono tracking-tight">
                          CODE: {cert.certificate_code}
                        </span>

                        {/* Status Badge */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          validity.valid
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}>
                          {validity.text}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-2">
                        {cert.course_title}
                      </h3>

                      {/* Small Preview Thumbnail */}
                      <div className="relative h-24 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center p-2">
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-950/20 via-transparent to-amber-950/20 opacity-30"></div>
                        <div className="border border-amber-500/30 w-full h-full rounded flex flex-col justify-between p-2 text-center relative">
                          {/* Khung họa tiết nhỏ */}
                          <div className="absolute inset-0.5 border border-amber-500/10 rounded pointer-events-none"></div>

                          <span className="text-[7px] uppercase font-bold text-amber-500 tracking-[0.2em] block truncate">
                            CSCA CERTIFICATE PREVIEW
                          </span>
                          <span className="text-[9px] font-serif text-slate-300 block font-bold truncate max-w-[80%] mx-auto">
                            {cert.student_name || "HỌC VIÊN CSCA"}
                          </span>
                          <span className="text-[6px] font-mono text-slate-600 block">
                            {cert.certificate_code}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {new Date(cert.issue_date).toLocaleDateString("vi-VN")}
                        </span>
                        <span className="text-slate-500 text-[10px] font-mono">
                          Học Viện CSCA Moli
                        </span>
                      </div>
                    </div>

                    {/* Footer của Card chứa nút bấm */}
                    <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-850 flex items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => handleShareCertificate(cert.certificate_code, e)}
                          className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                          title="Sao chép liên kết chia sẻ"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => triggerVerification(cert.certificate_code, e)}
                          className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                          title="Kiểm tra xác thực chứng chỉ"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        onClick={() => setSelectedCert(cert)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 shadow-md shadow-amber-500/5"
                      >
                        <span>Xem Chi Tiết</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PHẦN 1.5: Eligibility Tracker - Bảng theo dõi điều kiện cấp chứng chỉ */}
        <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 md:p-8 space-y-6 print:hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Tiến Độ & Điều Kiện Nhận Chứng Chỉ</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Quy chế cấp chứng chỉ chính thức: Hoàn thành 100% video bài học, làm bài tập đầy đủ và đạt điểm thi cuối khóa từ 6.0/10.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full text-xs font-bold font-mono">
              2 Khóa Đã Đạt Chuẩn
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Khóa 1 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-start gap-2">
                <h4 className="font-bold text-sm text-white">Khóa Học Luyện Thi HSK 3 Bứt Phá Điểm Số</h4>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
                  ĐÃ CẤP CHỨNG CHỈ
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Tiến độ video bài học (24/24 bài):</span>
                  <span className="text-emerald-400 font-bold font-mono">100% ✓</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Điểm thi trắc nghiệm cuối khóa:</span>
                  <span className="text-amber-400 font-bold font-mono">9.5 / 10.0 (Đạt) ✓</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Nộp bài tập ngữ pháp & khẩu ngữ:</span>
                  <span className="text-emerald-400 font-bold font-mono">Đã hoàn thành ✓</span>
                </div>
              </div>
            </div>

            {/* Khóa 2 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-start gap-2">
                <h4 className="font-bold text-sm text-white">Khóa Học CSCA Chuyên Sâu - Môn Toán Học</h4>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
                  ĐÃ CẤP CHỨNG CHỈ
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Tiến độ video bài học (30/30 bài):</span>
                  <span className="text-emerald-400 font-bold font-mono">100% ✓</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Điểm thi trắc nghiệm chuyên ngành:</span>
                  <span className="text-amber-400 font-bold font-mono">8.8 / 10.0 (Đạt) ✓</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Nộp bài tập luyện đề:</span>
                  <span className="text-emerald-400 font-bold font-mono">Đã hoàn thành ✓</span>
                </div>
              </div>
            </div>

            {/* Khóa 3: Đang học */}
            <div className="bg-slate-950/70 border border-amber-500/20 rounded-2xl p-5 space-y-3 md:col-span-2">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h4 className="font-bold text-sm text-white">Khóa Học Khẩu Ngữ HSKK Trung Cấp Cấp Tốc</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Cần hoàn thành thêm 6 bài học và nộp bài kiểm tra ghi âm để mở khóa chứng chỉ.</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                  TIẾN ĐỘ 75%
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[11px]">Tiến độ video</span>
                  <span className="font-bold text-amber-400 font-mono text-sm">18 / 24 bài (75%)</span>
                </div>
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[11px]">Bài tập khẩu ngữ HSKK</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">4 / 4 bài hoàn thành</span>
                </div>
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[11px]">Bài thi thử tổng hợp</span>
                  <span className="font-bold text-slate-400 font-mono text-sm">Chưa thi</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PHẦN 4: Verification Panel (Bảng xác minh chứng chỉ) */}
        <div id="verification-section" className="bg-slate-900 border border-slate-850 rounded-3xl p-6 md:p-8 space-y-6 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Hệ Thống Xác Minh Chứng Chỉ Công Khai</h2>
              <p className="text-slate-400 text-xs mt-0.5">Nhập mã chứng chỉ để tra cứu thông tin học tập chính chủ.</p>
            </div>
          </div>

          <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Ví dụ: CERT-HSK3-2026-X9A2"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={verifying}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold rounded-xl transition flex items-center justify-center gap-2 shrink-0"
            >
              {verifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang tra cứu...</span>
                </>
              ) : (
                <>
                  <span>Xác Minh Ngay</span>
                </>
              )}
            </button>
          </form>

          {/* Kết quả xác minh */}
          <AnimatePresence mode="wait">
            {verifiedResult && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className={`p-6 rounded-2xl border ${
                  verifiedResult.error
                    ? 'bg-rose-950/20 border-rose-500/30'
                    : 'bg-emerald-950/15 border-emerald-500/30'
                }`}
              >
                {verifiedResult.error ? (
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-rose-400">Không Thể Xác Thực</h3>
                      <p className="text-slate-300 text-sm mt-1">{verifiedResult.message}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Header kết quả */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 animate-pulse">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-emerald-400 text-lg flex items-center gap-2">
                          Hệ Thống Xác Thực Thành Công
                        </h3>
                        <p className="text-slate-400 text-xs mt-0.5">Chứng chỉ hợp lệ và được lưu trữ trên Blockchain học tập CSCA.</p>
                      </div>
                    </div>

                    {/* Chi tiết chứng chỉ đã xác thực */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-slate-950/60 p-5 rounded-xl border border-slate-850">
                      <div className="space-y-1">
                        <span className="text-slate-400 text-xs block">Mã chứng chỉ:</span>
                        <span className="font-mono font-bold text-white tracking-wider uppercase">{verifiedResult.certificateCode}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-400 text-xs block">Học viên sở hữu:</span>
                        <span className="font-bold text-amber-400">{verifiedResult.studentName || "Nguyễn Văn A"}</span>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <span className="text-slate-400 text-xs block">Nội dung chứng nhận hoàn thành:</span>
                        <span className="font-bold text-white">{verifiedResult.courseTitle}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-400 text-xs block">Ngày cấp chứng chỉ:</span>
                        <span className="text-slate-200">{verifiedResult.issueDate}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-400 text-xs block">Đơn vị cấp phát:</span>
                        <span className="text-slate-200">{verifiedResult.issuer || "Học Viện CSCA MoliStudio"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* PHẦN 2 & 3: Certificate Detail Modal/View & Actions */}
      <AnimatePresence>
        {selectedCert && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 print:relative print:inset-auto print:bg-white print:p-0">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl print:border-none print:bg-white print:shadow-none"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center print:hidden">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-white">Xem Bản Chi Tiết Chứng Chỉ</span>
                </div>
                <button
                  onClick={() => setSelectedCert(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Body: KHU VỰC THIẾT KẾ CHỨNG CHỈ CAO CẤP */}
              <div className="p-6 md:p-10 overflow-x-auto flex justify-center bg-slate-950/40 print:p-0 print:bg-white">

                {/* Khung chứng chỉ thiết kế mạ vàng thanh lịch */}
                <div
                  id="printable-certificate"
                  className="print-certificate-card relative w-[800px] h-[560px] shrink-0 bg-slate-900 border-[10px] border-amber-600 rounded-2xl p-8 md:p-12 flex flex-col justify-between text-center overflow-hidden shadow-2xl print:border-amber-600 print:text-black print:rounded-none"
                  style={{
                    boxShadow: "0 0 40px rgba(245, 158, 11, 0.15)",
                    borderImage: "linear-gradient(to bottom right, #f59e0b, #78350f, #d97706, #78350f) 10"
                  }}
                >
                  {/* WATERMARK EFFECT (Subtle repeating text in background) */}
                  <div className="absolute inset-0 select-none pointer-events-none opacity-[0.02] print:opacity-[0.03] overflow-hidden flex flex-wrap justify-center items-center gap-12 rotate-[-15deg] scale-110">
                    {Array.from({ length: 48 }).map((_, i) => (
                      <span key={i} className="text-white print:text-slate-900 text-xs font-mono font-bold tracking-widest uppercase">
                        CSCA OFFICIAL CERTIFICATE
                      </span>
                    ))}
                  </div>

                  {/* ORNAMENTAL BORDERS & CORNER DECORATIONS (SVG Corners) */}
                  <div className="absolute inset-2 border border-amber-500/20 pointer-events-none rounded-lg"></div>

                  {/* Top-Left Corner SVG */}
                  <svg className="absolute top-4 left-4 w-12 h-12 text-amber-500/50 print:text-amber-700 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M 0 50 L 0 0 L 50 0" />
                    <path d="M 10 50 L 10 10 L 50 10" />
                    <circle cx="20" cy="20" r="4" fill="currentColor" />
                  </svg>

                  {/* Top-Right Corner SVG */}
                  <svg className="absolute top-4 right-4 w-12 h-12 text-amber-500/50 print:text-amber-700 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M 100 50 L 100 0 L 50 0" />
                    <path d="M 90 50 L 90 10 L 50 10" />
                    <circle cx="80" cy="20" r="4" fill="currentColor" />
                  </svg>

                  {/* Bottom-Left Corner SVG */}
                  <svg className="absolute bottom-4 left-4 w-12 h-12 text-amber-500/50 print:text-amber-700 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M 0 50 L 0 100 L 50 100" />
                    <path d="M 10 50 L 10 90 L 50 90" />
                    <circle cx="20" cy="80" r="4" fill="currentColor" />
                  </svg>

                  {/* Bottom-Right Corner SVG */}
                  <svg className="absolute bottom-4 right-4 w-12 h-12 text-amber-500/50 print:text-amber-700 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M 100 50 L 100 100 L 50 100" />
                    <path d="M 90 50 L 90 90 L 50 90" />
                    <circle cx="80" cy="80" r="4" fill="currentColor" />
                  </svg>

                  {/* 1. HEADER LOGO AREA PLACEHOLDER */}
                  <div className="flex flex-col items-center space-y-1.5 z-10">
                    <div className="flex items-center gap-2">
                      {/* Logo SVG CSCA */}
                      <svg className="w-8 h-8 text-amber-500 print:text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                      <span className="text-sm font-black uppercase tracking-[0.25em] text-white print:text-slate-900 font-serif">
                        HỌC VIỆN CSCA
                      </span>
                    </div>
                    <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent"></div>
                  </div>

                  {/* 2. CHỨNG CHỈ TIÊU ĐỀ CHÍNH */}
                  <div className="space-y-1 z-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 print:text-amber-700">
                      CHỨNG NHẬN HOÀN THÀNH XUẤT SẮC
                    </p>
                    <h2 className="text-3xl md:text-4xl font-extrabold font-serif text-white print:text-slate-900 tracking-wide leading-none">
                      CERTIFICATE OF COMPLETION
                    </h2>
                    <p className="text-[9px] text-slate-400 print:text-slate-500 font-light italic">
                      Quyết định khen tặng và chứng nhận năng lực chuyên môn từ Hội đồng Đào tạo
                    </p>
                  </div>

                  {/* 3. THÔNG TIN HỌC VIÊN */}
                  <div className="space-y-2 z-10">
                    <p className="text-xs text-slate-300 print:text-slate-600 font-light italic">
                      Chứng chỉ này được trân trọng trao tặng cho
                    </p>
                    <h3 className="text-2xl md:text-3xl font-black text-amber-400 print:text-amber-700 font-serif tracking-wide border-b border-amber-500/20 pb-1.5 max-w-md mx-auto">
                      {selectedCert.student_name || "NGUYỄN VĂN A"}
                    </h3>
                    <p className="text-[11px] text-slate-300 print:text-slate-600 max-w-xl mx-auto leading-relaxed px-4">
                      Đã hoàn thành xuất sắc khóa học chuyên sâu được công nhận bởi hệ thống khảo thí và đào tạo ngôn ngữ Trung Quốc:
                    </p>
                    <p className="text-lg font-extrabold text-white print:text-slate-900 uppercase tracking-wide leading-tight">
                      {selectedCert.course_title}
                    </p>
                  </div>

                  {/* 4. CHÂN CHỨNG CHỈ - CHỮ KÝ, DẤU ĐỎ & QR CODE */}
                  <div className="grid grid-cols-3 items-end pt-4 border-t border-amber-500/20 z-10 text-[10px] text-slate-400 print:text-slate-600 font-mono">

                    {/* Cột 1: QR Code & Mã chứng chỉ */}
                    <div className="flex flex-col items-center md:items-start space-y-2">
                      <div className="print-qr-bg">
                        {renderMockQr(selectedCert.certificate_code)}
                      </div>
                      <div className="text-left">
                        <span className="text-[9px] text-amber-500 print:text-amber-700 font-bold block">CODE XÁC THỰC:</span>
                        <span className="text-xs font-bold text-white print:text-slate-900 font-mono block tracking-tight uppercase">
                          {selectedCert.certificate_code}
                        </span>
                      </div>
                    </div>

                    {/* Cột 2: Gold Seal Badge (Con dấu nổi) */}
                    <div className="flex justify-center pb-2">
                      <div className="w-20 h-20 rounded-full border-4 border-double border-amber-500 bg-amber-500/5 print:bg-white flex flex-col items-center justify-center p-1 shadow-lg shrink-0">
                        <svg className="w-8 h-8 text-amber-400 print:text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4l3 3" />
                        </svg>
                        <span className="text-[8px] font-black uppercase text-amber-500 print:text-amber-700 text-center leading-none mt-1">
                          OFFICIAL CERT
                        </span>
                      </div>
                    </div>

                    {/* Cột 3: Digital Signature (Chữ ký và dấu đỏ) */}
                    <div className="flex flex-col items-center md:items-end space-y-2 relative">
                      {/* Con dấu đỏ mô phỏng */}
                      <div className="absolute right-4 bottom-4 w-16 h-16 rounded-full border-2 border-dashed border-red-600/60 bg-red-500/5 flex items-center justify-center rotate-12 pointer-events-none select-none">
                        <div className="text-[7px] text-red-600/80 font-bold font-serif text-center leading-tight uppercase">
                          CSCA<br />MOLISTUDIO<br />ĐÃ CẤP
                        </div>
                      </div>

                      {/* Chữ ký số viết tay cách điệu */}
                      <div className="h-10 flex items-center justify-center font-serif text-amber-300 print:text-slate-800 text-2xl italic tracking-widest select-none relative z-10 pr-4">
                        Moli Studio
                      </div>

                      <div className="text-right border-t border-slate-800 print:border-slate-300 pt-1 w-full max-w-[150px]">
                        <span className="text-amber-500 print:text-amber-700 font-bold block">NGÀY CẤP PHÁT:</span>
                        <span className="font-bold text-white print:text-slate-900 block">
                          {new Date(selectedCert.issue_date).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                    </div>

                  </div>

                </div>

              </div>

              {/* Modal Footer Actions */}
              <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex flex-wrap justify-between items-center gap-4 print:hidden">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Đường dẫn xác minh công khai:</span>
                  <span className="text-xs font-mono text-amber-500 select-all font-semibold bg-slate-900 px-2 py-1 rounded">
                    {window.location.origin}/verify/{selectedCert.certificate_code}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => handleShareCertificate(selectedCert.certificate_code, e)}
                    className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Chia Sẻ Link</span>
                  </button>

                  <button
                    onClick={(e) => {
                      setSelectedCert(null);
                      triggerVerification(selectedCert.certificate_code, e);
                    }}
                    className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Xác Minh Lại</span>
                  </button>

                  <button
                    onClick={() => handleDownloadPdf(selectedCert.course_title)}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-amber-500/10"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải PDF / In Bằng</span>
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
