export default function ScheduleMottoCard() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md">
      {/* Background campus landscape */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
        style={{
          backgroundImage: "url('/student-campus-spring.webp')",
          backgroundPosition: "right 20% center",
        }}
      />
      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-transparent sm:from-white/90 sm:via-white/50" />

      {/* Content */}
      <div className="relative z-10 flex min-h-[110px] flex-col justify-center p-4">
        <p className="font-['Dancing_Script',cursive] text-xl font-bold leading-tight text-[#102f63] sm:text-2xl">
          Kiến thức hôm nay
        </p>
        <p className="font-['Dancing_Script',cursive] text-xl font-bold leading-tight text-[#102f63] sm:text-2xl">
          Kiến tạo ngày mai
        </p>
        <p className="mt-1 font-['Ma_Shan_Zheng',cursive] text-xs tracking-wider text-slate-600 sm:text-[13px]">
          今日之学，明日之未来。
        </p>
      </div>
    </div>
  );
}
