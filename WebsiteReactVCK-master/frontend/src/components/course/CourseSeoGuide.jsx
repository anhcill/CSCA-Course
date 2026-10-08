import { CheckCircle2, GraduationCap, Trophy, Laptop, Award, ShieldCheck, Sparkles } from 'lucide-react';

export default function CourseSeoGuide() {
  const highlights = [
    {
      icon: GraduationCap,
      title: 'Luyện thi chuẩn đầu vào CSCA',
      desc: 'Bám sát ma trận đề thi thực tế các môn Toán học, Khoa học tự nhiên và ngôn ngữ, ngân hàng câu hỏi chọn lọc có giải thích chi tiết.',
      badge: 'Độc quyền'
    },
    {
      icon: Trophy,
      title: 'Chứng chỉ HSK & HSKK tinh gọn',
      desc: 'Lộ trình tối ưu từ HSK 1 đến HSK 6, sửa phát âm 1-1, rèn phản xạ khẩu ngữ lưu loát tự tin trong môi trường du học.',
      badge: 'Chuẩn quốc tế'
    },
    {
      icon: Laptop,
      title: 'Nền tảng LMS học & thi thử 24/7',
      desc: 'Giao diện thân thiện, làm bài trắc nghiệm và tự luận có chấm điểm tức thì, thống kê năng lực và tiến độ theo thời gian thực.',
      badge: 'Tiện lợi'
    },
    {
      icon: Award,
      title: 'Đồng hành săn học bổng Trung Quốc',
      desc: 'Hỗ trợ tư vấn chọn trường top (Thanh Hoa, Bắc Đại, Vũ Hán,...), hoàn thiện kế hoạch học tập (Study Plan) và hồ sơ CSC, CIS.',
      badge: 'Tận tâm'
    }
  ];

  return (
    <section className="mt-16 border-t border-gray-200/80 pt-12 dark:border-gray-800">
      <div className="rounded-3xl border border-red-100 bg-gradient-to-br from-white via-red-50/20 to-amber-50/30 p-6 shadow-sm dark:border-gray-800 dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 sm:p-10">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> Chuẩn Đầu Ra Moly Course
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:text-3xl">
            Vì Sao Học Viên Lựa Chọn Chương Trình Đào Tạo Tại Moly Course?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:text-base">
            Moly Course xây dựng giải pháp học tập tích hợp: kết hợp bài giảng chuyên sâu, hệ sinh thái luyện thi LMS thông minh và cố vấn hồ sơ du học, giúp bạn tiết kiệm 40% thời gian ôn luyện mà vẫn đạt kết quả cao nhất.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-gray-800 dark:bg-gray-800/80"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-amber-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {item.badge}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-black text-gray-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl bg-gray-950 p-5 text-white dark:bg-black sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-amber-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold">Cam kết chất lượng đào tạo và hỗ trợ học viên 1-1</h4>
              <p className="text-xs text-gray-400 mt-0.5">Kiểm tra đầu vào miễn phí, định hướng lộ trình học phù hợp với từng học viên.</p>
            </div>
          </div>
          <a
            href="https://zalo.me/0815913408"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-gray-950 transition hover:bg-amber-300"
          >
            Nhận Tư Vấn Lộ Trình Miễn Phí
          </a>
        </div>
      </div>
    </section>
  );
}
