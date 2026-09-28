import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import Meta from '../../components/Meta.jsx';

const policySections = [
  {
    number: '01',
    title: 'Điều khoản sử dụng',
    intro: 'Khi truy cập website, tạo tài khoản hoặc tham gia một khóa học của MOLY COURSE, bạn xác nhận đã đọc và đồng ý với các nguyên tắc dưới đây.',
    items: [
      ['Tài khoản học viên', 'Bạn chịu trách nhiệm cung cấp thông tin chính xác, giữ an toàn thông tin đăng nhập và thông báo sớm cho MOLY COURSE khi phát hiện hoạt động bất thường. Một tài khoản được dùng cho đúng người đăng ký; không chia sẻ, cho thuê hoặc chuyển quyền truy cập khi chưa được chấp thuận.'],
      ['Quyền truy cập khóa học', 'Quyền truy cập được cấp theo chương trình, thời hạn và điều kiện đã thông báo tại thời điểm đăng ký. Nội dung học tập chỉ phục vụ mục đích học cá nhân, không được sao chép, phát tán, bán lại hoặc dùng để xây dựng dịch vụ cạnh tranh.'],
      ['Cách sử dụng nền tảng', 'Không sử dụng website để gửi nội dung trái pháp luật, giả mạo danh tính, gây gián đoạn hệ thống, dò quét bảo mật, thu thập dữ liệu của người khác hoặc thực hiện hành vi ảnh hưởng đến quyền lợi của học viên và giảng viên.'],
      ['Cập nhật điều khoản', 'MOLY COURSE có thể điều chỉnh tính năng, chương trình hoặc điều khoản để phù hợp với hoạt động thực tế. Phiên bản mới sẽ được công khai trên trang này; việc tiếp tục sử dụng dịch vụ sau thời điểm cập nhật được hiểu là bạn đồng ý với nội dung mới.']
    ]
  },
  {
    number: '02',
    title: 'Đăng ký, học phí và hỗ trợ học tập',
    intro: 'MOLY COURSE ưu tiên trao đổi rõ mục tiêu, chương trình và cách học trước khi xác nhận đăng ký.',
    items: [
      ['Thông tin trước khi đăng ký', 'Tên khóa học, mục tiêu, hình thức học, lịch dự kiến, quyền lợi đi kèm và khoản phí áp dụng sẽ được tư vấn theo từng chương trình. Bạn nên đọc kỹ thông tin và hỏi lại những điểm chưa rõ trước khi thanh toán.'],
      ['Xác nhận thanh toán', 'Chỉ thực hiện thanh toán qua kênh được MOLY COURSE xác nhận. Hãy lưu lại nội dung trao đổi và bằng chứng giao dịch để thuận tiện đối soát. Không gửi mật khẩu, mã OTP hoặc thông tin bảo mật cho bất kỳ cá nhân nào tự nhận là nhân viên.'],
      ['Thay đổi lịch học', 'Lịch học, tài liệu và hình thức tổ chức có thể được điều chỉnh vì lý do chuyên môn hoặc vận hành. Khi có thay đổi đáng kể, MOLY COURSE sẽ thông báo qua kênh liên hệ đã đăng ký và hướng dẫn phương án tiếp theo.'],
      ['Kết quả học tập', 'MOLY COURSE cung cấp môi trường, lộ trình và phản hồi để hỗ trợ việc học. Kết quả phụ thuộc vào nền tảng, thời lượng luyện tập, mức độ tham gia và yêu cầu của từng kỳ thi; việc tham gia khóa học không đồng nghĩa với cam kết đạt điểm, học bổng, visa hoặc kết quả tuyển sinh.']
    ]
  },
  {
    number: '03',
    title: 'Chính sách bảo mật thông tin',
    intro: 'MOLY COURSE chỉ sử dụng thông tin cần thiết để tư vấn, vận hành lớp học và hỗ trợ hành trình học tập của bạn.',
    items: [
      ['Thông tin có thể được tiếp nhận', 'Tùy tương tác, thông tin có thể gồm họ tên, số điện thoại, email, mục tiêu học, lịch sử đăng ký, tiến độ học, nội dung trao đổi hỗ trợ và dữ liệu kỹ thuật cơ bản khi bạn sử dụng website.'],
      ['Mục đích sử dụng', 'Thông tin được dùng để xác nhận đăng ký, cung cấp quyền học, gửi thông báo liên quan, xử lý yêu cầu hỗ trợ, cải thiện chương trình và bảo vệ an toàn tài khoản. MOLY COURSE không dùng thông tin cho mục đích khác vượt ngoài phạm vi đã thông báo nếu chưa có căn cứ phù hợp.'],
      ['Lưu trữ và chia sẻ', 'Dữ liệu được lưu trong thời gian cần thiết cho các mục đích vận hành, chăm sóc học viên và tuân thủ nghĩa vụ pháp lý. Chỉ chia sẻ cho đơn vị cung cấp hạ tầng hoặc dịch vụ hỗ trợ cần thiết, hoặc khi có yêu cầu hợp pháp từ cơ quan có thẩm quyền.'],
      ['Quyền của bạn', 'Bạn có thể yêu cầu kiểm tra, cập nhật hoặc đề nghị giải thích việc sử dụng thông tin cá nhân qua Zalo 0815913408. Một số dữ liệu cần được giữ lại để hoàn tất giao dịch, giải quyết tranh chấp hoặc đáp ứng yêu cầu pháp lý.']
    ]
  },
  {
    number: '04',
    title: 'Bản quyền và nội dung học tập',
    intro: 'Mọi tài liệu, nhận diện, bài giảng, thiết kế và nội dung do MOLY COURSE cung cấp đều được bảo vệ theo quy định áp dụng.',
    items: [
      ['Quyền sở hữu nội dung', 'Tên MOLY COURSE, giao diện, bài viết, tài liệu, video, hình ảnh và cấu trúc bài học thuộc về MOLY COURSE hoặc bên cấp quyền. Quyền truy cập khóa học không đồng nghĩa với việc chuyển quyền sở hữu cho học viên.'],
      ['Nội dung do học viên gửi', 'Khi gửi câu hỏi, bài tập, phản hồi hoặc nội dung trong lớp, bạn vẫn giữ quyền đối với phần nội dung của mình nhưng đồng ý cho MOLY COURSE sử dụng trong phạm vi cần thiết để giảng dạy, chấm bài, hỗ trợ và cải thiện dịch vụ.'],
      ['Thông báo vi phạm', 'Nếu bạn cho rằng nội dung trên nền tảng vi phạm quyền của mình, hãy gửi mô tả nội dung, căn cứ quyền sở hữu và thông tin liên hệ qua Zalo 0815913408. MOLY COURSE sẽ tiếp nhận, xác minh và phản hồi trong phạm vi có thể.']
    ]
  },
  {
    number: '05',
    title: 'Giới hạn trách nhiệm và thông tin tham khảo',
    intro: 'Nội dung trên website nhằm hỗ trợ việc học và định hướng chuẩn bị hồ sơ; không thay thế thông báo chính thức của cơ quan tổ chức kỳ thi, trường học hoặc cơ quan quản lý.',
    items: [
      ['Thông tin kỳ thi và du học', 'Lịch thi, tiêu chí tuyển sinh, học phí, học bổng, hồ sơ và quy định nhập cảnh có thể thay đổi theo từng thời điểm. Bạn cần kiểm tra nguồn chính thức trước khi nộp hồ sơ hoặc thực hiện giao dịch.'],
      ['Tính liên tục của dịch vụ', 'MOLY COURSE nỗ lực duy trì website và lớp học ổn định nhưng không thể đảm bảo mọi hệ thống luôn hoạt động không gián đoạn do bảo trì, lỗi đường truyền hoặc sự kiện ngoài khả năng kiểm soát.'],
      ['Liên kết bên ngoài', 'Website có thể dẫn tới TikTok, Facebook hoặc trang của bên thứ ba. MOLY COURSE không kiểm soát toàn bộ nội dung, chính sách dữ liệu hoặc hoạt động của các nền tảng đó; bạn nên tự xem lại điều khoản của từng dịch vụ.']
    ]
  },
  {
    number: '06',
    title: 'Kênh liên hệ chính thức',
    intro: 'Để được tư vấn và xác minh thông tin, vui lòng dùng một trong các kênh chính thức dưới đây.',
    items: [
      ['Zalo', '0815913408 — kênh tư vấn và tiếp nhận yêu cầu hỗ trợ học viên.'],
      ['TikTok', 'Theo dõi nội dung mới tại tài khoản @moly_studio01.'],
      ['Facebook', 'Cập nhật thông báo và hoạt động tại trang Facebook chính thức của MOLY COURSE.']
    ]
  }
];

export default function PoliceAndLegal() {
  return (
    <div className="min-h-screen bg-[#fffaf6] py-12 dark:bg-slate-950 sm:py-16">
      <Meta
        title="Chính sách & Pháp lý | MOLY COURSE 2026"
        description="Điều khoản sử dụng, chính sách bảo mật, bản quyền và thông tin liên hệ của MOLY COURSE 2026."
        keywords="MOLY COURSE 2026, chính sách, pháp lý, bảo mật, điều khoản, bản quyền"
      />
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 px-6 py-12 text-white shadow-2xl sm:px-10 lg:px-14 lg:py-16">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-red-500/20 blur-3xl" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-300"><ShieldCheck className="h-4 w-4" /> MOLY COURSE 2026</span>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">Chính sách & Pháp lý</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Thông tin rõ ràng để bạn hiểu quyền lợi, trách nhiệm và cách MOLY COURSE xử lý việc học, dữ liệu cá nhân và nội dung trên nền tảng.</p>
            <p className="mt-6 text-sm font-semibold text-slate-400">Phiên bản áp dụng cho MOLY COURSE 2026 · Cập nhật 01/01/2026</p>
          </div>
        </header>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <FileText className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Đây là thông tin vận hành dành cho người dùng website và học viên. Nếu bạn cần xác nhận một điều kiện riêng của khóa học, hãy liên hệ MOLY COURSE trước khi đăng ký.</p>
        </div>

        <div className="mt-8 space-y-6">
          {policySections.map((section) => (
            <section key={section.number} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-9">
              <div className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-sm font-black text-white shadow-lg shadow-red-600/20 dark:bg-amber-400 dark:text-slate-950">{section.number}</span>
                <div className="min-w-0">
                  <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{section.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{section.intro}</p>
                </div>
              </div>
              <div className="mt-7 grid gap-4 md:grid-cols-2">
                {section.items.map(([title, body]) => (
                  <div key={title} className="rounded-2xl bg-slate-50 p-5 dark:bg-white/5">
                    <h3 className="flex items-start gap-2 text-sm font-black text-slate-900 dark:text-white"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-amber-300" />{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{body}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-3xl bg-red-600 p-6 text-white shadow-xl shadow-red-600/20 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-black">Cần được giải đáp trước khi đăng ký?</h2>
            <p className="mt-2 text-sm leading-6 text-red-100">Nhắn Zalo 0815913408 để được tư vấn theo mục tiêu học của bạn.</p>
          </div>
          <a href="https://zalo.me/0815913408" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-50">Mở Zalo <ArrowUpRight className="h-4 w-4" /></a>
        </div>

        <p className="mt-8 text-center text-xs leading-6 text-slate-500 dark:text-slate-400">Nếu có mâu thuẫn giữa thông tin tổng quát trên trang này và điều kiện riêng của một chương trình, điều kiện được thông báo trực tiếp cho chương trình đó sẽ được dùng để đối chiếu.</p>
        <p className="mt-4 text-center text-sm font-bold text-slate-600 dark:text-slate-300"><Link to="/" className="hover:text-red-600 dark:hover:text-amber-300">Về trang chủ MOLY COURSE</Link></p>
      </div>
    </div>
  );
}
