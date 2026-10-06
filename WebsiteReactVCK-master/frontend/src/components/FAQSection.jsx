import { useState } from 'react';
import { ChevronDown, HelpCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const FAQ_DATA = [
  {
    id: 'csca-exam',
    question: 'Kỳ thi CSCA là gì và Moly Course hỗ trợ luyện thi như thế nào?',
    answer: 'CSCA là kỳ thi đánh giá năng lực chuẩn đầu vào dành cho học sinh, sinh viên có kế hoạch du học tại các trường đại học hàng đầu Trung Quốc. Khóa học tại Moly Course được thiết kế bám sát cấu trúc đề thi thực tế (Toán học, Khoa học & ngôn ngữ), cung cấp ngân hàng bài tập chuyên sâu, giải chi tiết và thi thử trực tiếp trên hệ thống LMS.'
  },
  {
    id: 'beginner-learning',
    question: 'Người mới bắt đầu học tiếng Trung từ con số 0 có theo kịp lộ trình không?',
    answer: 'Hoàn toàn phù hợp. Moly Course xây dựng lộ trình 12 tuần nền tảng HSK 1–2 dành riêng cho người mới bắt đầu: chuẩn hóa phát âm Pinyin, quy tắc ghép thanh điệu, nhận diện chữ Hán căn bản và thực hành phản xạ giao tiếp các chủ đề thông dụng trong đời sống.'
  },
  {
    id: 'lms-features',
    question: 'Hệ thống học tập trực tuyến LMS của Moly Course có những tính năng gì nổi bật?',
    answer: 'Học viên được truy cập không gian học 24/7 với bài giảng chi tiết, hệ thống làm bài tập trắc nghiệm & tự luận chấm điểm tự động, thi thử mô phỏng thời gian phòng thi thật, xem thống kê tiến độ học tập và tham gia các buổi học tương tác cùng giảng viên.'
  },
  {
    id: 'scholarship-support',
    question: 'Moly Course có hỗ trợ tư vấn hồ sơ xin học bổng du học Trung Quốc không?',
    answer: 'Có. Đội ngũ Moly Course hỗ trợ học viên định hướng trường đại học mục tiêu (như ĐH Thanh Hoa, Bắc Đại, Nam Kinh, Vũ Hán,...), tư vấn kế hoạch học tập (Study Plan), rèn luyện phỏng vấn và chuẩn bị trọn bộ hồ sơ xin học bổng Chính phủ (CSC), học bổng Khổng Tử (CIS) và học bổng trường.'
  },
  {
    id: 'how-to-enroll',
    question: 'Làm thế nào để đăng ký học và nhận tư vấn lộ trình cá nhân hóa?',
    answer: 'Bạn có thể chọn khóa học trực tiếp tại mục Khóa Học trên thanh điều hướng hoặc liên hệ trực tiếp qua Zalo/Hotline 0815913408 để được kiểm tra trình độ đầu vào và tư vấn kế hoạch học tập hoàn toàn miễn phí.'
  }
];

export const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': FAQ_DATA.map((item) => ({
    '@type': 'Question',
    'name': item.question,
    'acceptedAnswer': {
      '@type': 'Answer',
      'text': item.answer
    }
  }))
};

export default function FAQSection() {
  const [openId, setOpenId] = useState(FAQ_DATA[0].id);

  const toggleItem = (id) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section className="relative overflow-hidden bg-white py-16 transition-colors dark:bg-gray-950 sm:py-24" id="faq">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-1 text-xs font-black uppercase tracking-widest text-red-700 dark:border-red-500/20 dark:bg-red-950/40 dark:text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> Giải đáp thắc mắc
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-gray-950 dark:text-white sm:text-4xl">
            Câu Hỏi Thường Gặp Về Moly Course
          </h2>
          <p className="mt-3 text-base text-gray-600 dark:text-gray-400 sm:text-lg">
            Những thông tin quan trọng về lộ trình ôn thi CSCA, chứng chỉ tiếng Trung và hệ thống học trực tuyến.
          </p>
        </div>

        {/* Accordion List */}
        <div className="mt-10 space-y-4">
          {FAQ_DATA.map((faq, index) => {
            const isOpen = openId === faq.id;
            return (
              <div
                key={faq.id}
                className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                  isOpen
                    ? 'border-red-300 bg-red-50/40 shadow-md dark:border-red-500/30 dark:bg-red-950/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900/60 dark:hover:border-gray-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(faq.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left font-bold transition sm:p-6"
                >
                  <span className="flex items-center gap-3 text-base text-gray-950 dark:text-white sm:text-lg">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-black text-red-600 dark:bg-red-950/60 dark:text-amber-300">
                      0{index + 1}
                    </span>
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-300 ${
                      isOpen ? 'rotate-180 text-red-600 dark:text-amber-400' : ''
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                    >
                      <div className="border-t border-red-200/50 px-5 pb-5 pt-3 text-sm leading-relaxed text-gray-700 dark:border-red-500/10 dark:text-gray-300 sm:px-6 sm:pb-6 sm:text-base">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Bottom Support Banner */}
        <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          <HelpCircle className="mx-auto h-8 w-8 text-red-600 dark:text-amber-400" />
          <h3 className="mt-3 text-lg font-bold text-gray-950 dark:text-white">
            Bạn còn thắc mắc khác chưa được giải đáp?
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Đội ngũ chuyên viên Moly Course luôn sẵn sàng giải đáp và tư vấn lộ trình phù hợp với mục tiêu của bạn.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://zalo.me/0815913408"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-red-600/20 transition hover:bg-red-700 active:scale-95"
            >
              Tư Vấn Zalo Miễn Phí
            </a>
            <a
              href="tel:0815913408"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-800 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Hotline: 0815 913 408
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
