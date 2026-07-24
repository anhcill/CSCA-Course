import PropTypes from 'prop-types';
import { Quote, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const feedbacks = [
  {
    id: 1,
    name: 'Học viên HSK sơ cấp',
    avatar: '/avatar/avt_1.webp',
    content: 'Lộ trình được chia nhỏ, dễ theo dõi và phù hợp với người mới bắt đầu học tiếng Trung.',
    focus: 'Lộ trình HSK 1–2',
  },
  {
    id: 2,
    name: 'Học viên lớp trung cấp',
    avatar: '/avatar/avt_2.webp',
    content: 'Bài học bám sát mục tiêu, phần luyện nghe và từ vựng giúp mình duy trì nhịp học đều hơn.',
    focus: 'Luyện thi HSK 3–4',
  },
  {
    id: 3,
    name: 'Học viên luyện nói',
    avatar: '/avatar/avt_3.webp',
    content: 'Mình thích cách giáo viên sửa phát âm và phản hồi trực tiếp trong các buổi luyện giao tiếp.',
    focus: 'HSKK · Giao tiếp',
  },
  {
    id: 4,
    name: 'Học viên định hướng du học',
    avatar: '/avatar/avt_4.webp',
    content: 'Quy trình tư vấn rõ ràng giúp mình hiểu cần chuẩn bị tiếng Trung và hồ sơ theo từng giai đoạn.',
    focus: 'Tư vấn lộ trình',
  },
  {
    id: 5,
    name: 'Học viên lớp online',
    avatar: '/avatar/avt_5.webp',
    content: 'Lịch học linh hoạt, tài liệu gọn gàng và mình có thể xem lại nội dung để củng cố kiến thức.',
    focus: 'Học trực tuyến',
  },
  {
    id: 6,
    name: 'Học viên HSK cao cấp',
    avatar: '/avatar/avt_6.webp',
    content: 'Phần chữa bài giúp mình nhận ra điểm yếu và xây dựng kế hoạch ôn tập có trọng tâm hơn.',
    focus: 'Luyện thi HSK 5–6',
  },
];

const FeedbackCard = ({ feedback }) => (
  <article className="mb-4 rounded-[1.5rem] border border-red-100/80 bg-white/90 p-5 shadow-sm backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-red-950/5 dark:border-white/10 dark:bg-gray-900/90">
    <div className="flex items-start gap-4">
      <img
        src={feedback.avatar}
        alt={`Ảnh đại diện mẫu của ${feedback.name}`}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.src = '/avatar/avt_1.webp';
        }}
        className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-2 ring-red-100 dark:ring-red-900/50"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-gray-950 dark:text-white">{feedback.name}</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-red-600 dark:text-amber-400">{feedback.focus}</p>
          </div>
          <Quote className="h-5 w-5 shrink-0 text-red-200 dark:text-red-800" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm leading-7 text-gray-600 dark:text-gray-300">{feedback.content}</p>
      </div>
    </div>
    <div className="mt-4 flex items-center gap-1" aria-label="Đánh giá 5 trên 5 sao">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
      ))}
    </div>
  </article>
);

FeedbackCard.propTypes = {
  feedback: PropTypes.shape({
    name: PropTypes.string.isRequired,
    avatar: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    focus: PropTypes.string.isRequired,
  }).isRequired,
};

const FeedBack = () => {
  const { t } = useTranslation();
  const duplicatedFeedbacks = [...feedbacks, ...feedbacks];

  return (
    <section className="overflow-hidden bg-gradient-to-br from-[#fff8f3] via-white to-red-50 px-4 py-24 dark:from-gray-950 dark:via-gray-900 dark:to-red-950/20 sm:px-6 lg:px-8" aria-labelledby="feedback-title">
      <div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative max-w-xl">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-red-300/15 blur-3xl" />
          <p className="relative text-sm font-black uppercase tracking-[0.24em] text-red-600 dark:text-amber-400">Cộng đồng học viên CSCA</p>
          <h2 id="feedback-title" className="relative mt-4 text-4xl font-black leading-[1.1] tracking-tight text-gray-950 dark:text-white sm:text-5xl lg:text-6xl">
            Được tin tưởng
            <span className="block bg-gradient-to-r from-red-700 via-red-500 to-amber-500 bg-clip-text text-transparent">và đánh giá cao</span>
            <span className="mt-3 block text-2xl font-bold text-gray-600 dark:text-gray-300 sm:text-3xl">bởi cộng đồng học viên</span>
          </h2>
          <p className="relative mt-7 text-base leading-8 text-gray-600 dark:text-gray-300 sm:text-lg">
            Những chia sẻ mẫu dưới đây mô tả trải nghiệm học tập mà CSCA Academy hướng tới. Phản hồi, điểm thi và thành tích thật sẽ được cập nhật khi có xác nhận từ học viên.
          </p>
          <div className="relative mt-8 inline-flex items-center gap-3 rounded-2xl border border-red-100 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-gray-900">
            <div className="flex -space-x-2" aria-hidden="true">
              {feedbacks.slice(0, 4).map((feedback) => (
                <img key={feedback.id} src={feedback.avatar} alt="" className="h-9 w-9 rounded-full border-2 border-white object-cover dark:border-gray-900" />
              ))}
            </div>
            <div>
              <strong className="block text-sm text-gray-950 dark:text-white">Đồng hành theo từng mục tiêu</strong>
              <span className="text-xs text-gray-500 dark:text-gray-400">HSK · HSKK · CSCA · Du học</span>
            </div>
          </div>
          <span className="sr-only">{t('feedbackContent')}</span>
        </div>

        <div className="feedback-marquee-mask relative h-[620px] overflow-hidden rounded-[2rem]" aria-label="Các chia sẻ trải nghiệm mẫu">
          <div className="feedback-marquee grid grid-cols-1 gap-4 sm:grid-cols-2">
            {duplicatedFeedbacks.map((feedback, index) => (
              <div key={`${feedback.id}-${index}`} className={index % 2 === 0 ? 'sm:translate-y-8' : ''}>
                <FeedbackCard feedback={feedback} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeedBack;
