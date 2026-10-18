import PropTypes from 'prop-types';
import { FiChevronDown, FiEyeOff, FiImage, FiMessageCircle, FiPaperclip, FiSend, FiX } from 'react-icons/fi';
import AIFormattedText from './AIFormattedText.jsx';
import { PET_VARIANTS } from './constants.js';
import { PetFace } from './PetFace.jsx';
import { useMoliPetController } from './useMoliPetController.js';

const ANIMAL_VARIANTS = [
  'moly-3d-panda',
  'moly-3d',
  'moly-3d-fox',
  'moly-3d-penguin',
  'moly-3d-hog',
  'moly-3d-crab',
];

const QUICK_PROMPTS = [
  'Giúp mình giải bài này',
  'Lập kế hoạch học tập',
  'Cùng mình ôn từ vựng',
];

export default function MolyPetRoot({ defaultPosition = 'left' }) {
  const controller = useMoliPetController({ defaultPosition });
  const {
    mounted,
    hidden,
    open,
    minimized,
    settingsOpen,
    settings,
    input,
    pastedImage,
    processingImage,
    loading,
    messages,
    petPoint,
    dragging,
    walking,
    facing,
    petMood,
    routeHint,
    cooldownSeconds,
    showHintBubble,
    panelStyle,
    containerStyle,
    bubbleSideClass,
    messagesScrollRef,
  } = controller;

  if (!mounted) return null;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={controller.restorePet}
        className="moli-pet-restore fixed bottom-5 left-5 z-[65] grid h-12 w-12 place-items-center rounded-full border border-violet-200 bg-white/95 text-violet-600 shadow-xl backdrop-blur transition hover:-translate-y-0.5"
        aria-label="Hiện Moly Pet"
      >
        <FiMessageCircle className="h-5 w-5" />
      </button>
    );
  }

  if (!petPoint) return null;

  const submit = (event) => {
    controller.sendMessage(event);
  };

  return (
    <>
      {open && !minimized && (
        <section
          className="moli-pet-theme fixed z-[90] flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-violet-100/90 bg-white/95 text-slate-800 shadow-[0_24px_70px_rgba(76,57,130,0.22)] backdrop-blur-2xl"
          style={panelStyle}
          aria-label="Trò chuyện với Moly Pet"
        >
          <header className="relative flex min-h-[68px] shrink-0 items-center gap-2 border-b border-violet-100/80 px-4">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-black text-slate-900">Moly Pet</h2>
              <p className="text-[11px] font-medium text-slate-400">
                {loading ? 'Đang suy nghĩ…' : 'Trợ lý học tập của bạn'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => controller.setSettingsOpen((value) => !value)}
              className="flex h-9 items-center gap-1 rounded-full border border-violet-100 bg-violet-50 px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
              aria-expanded={settingsOpen}
            >
              Đổi pet
              <FiChevronDown className={`transition ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => controller.setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Đóng trò chuyện"
            >
              <FiX className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={controller.hideForDay}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-violet-50 hover:text-violet-700"
              aria-label="Ẩn Moly Pet hôm nay"
              title="Ẩn pet hôm nay"
            >
              <FiEyeOff className="h-[18px] w-[18px]" />
            </button>
          </header>

          {settingsOpen && (
            <div className="moli-pet-soft shrink-0 border-b border-violet-100 bg-violet-50/70 p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-violet-500">
                Chọn người bạn đồng hành
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ANIMAL_VARIANTS.map((variant) => {
                  const animal = PET_VARIANTS[variant];
                  const active = settings.variant === variant;
                  return (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => {
                        controller.updateSettings({ variant });
                        controller.setSettingsOpen(false);
                      }}
                      className={`flex min-w-0 flex-col items-center rounded-2xl border p-2 transition ${
                        active
                          ? 'moli-pet-white border-violet-400 bg-white shadow-[0_7px_18px_rgba(124,91,200,0.16)]'
                          : 'moli-pet-white border-transparent bg-white/70 hover:border-violet-200 hover:bg-white'
                      }`}
                      aria-pressed={active}
                    >
                      <img
                        src={animal.preview}
                        alt=""
                        className="h-12 w-12 object-contain [image-rendering:auto]"
                      />
                      <span className="mt-1 max-w-full truncate text-[10px] font-bold text-slate-600">
                        {animal.label.replace(' 3D', '').replace(' hiện tại', '')}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={controller.hideForDay}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white hover:text-slate-600"
              >
                <FiEyeOff />
                Ẩn pet hôm nay
              </button>
            </div>
          )}

          <div
            ref={messagesScrollRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`min-w-0 max-w-[88%] break-words rounded-[19px] px-3.5 py-3 [overflow-wrap:anywhere] ${
                  message.role === 'user'
                    ? 'ml-auto rounded-br-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md'
                    : 'moli-pet-soft mr-auto rounded-bl-md border border-violet-100 bg-violet-50/60 text-slate-700'
                }`}
              >
                {message.imageDataUrl && (
                  <div className="mb-2 overflow-hidden rounded-xl">
                    <img
                      src={message.imageDataUrl}
                      alt="Ảnh đã gửi"
                      className="max-h-44 w-full object-cover"
                    />
                  </div>
                )}
                <AIFormattedText
                  value={message.content}
                  className={message.role === 'user' ? 'text-white' : ''}
                />
              </div>
            ))}

            {loading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="moli-pet-white mr-auto flex gap-1.5 rounded-2xl rounded-bl-md border border-violet-100 bg-white px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" />
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-violet-100/80 p-3">
            {messages.length <= 1 && (
              <div className="hide-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => controller.setInput(prompt)}
                    className="shrink-0 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 transition hover:border-violet-300"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {pastedImage && (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">
                <FiImage />
                <span className="min-w-0 flex-1 truncate">{pastedImage.name || 'Ảnh đã dán'}</span>
                <button type="button" onClick={controller.clearPastedImage} aria-label="Bỏ ảnh">
                  <FiX />
                </button>
              </div>
            )}

            <form
              onSubmit={submit}
              className="moli-pet-white flex items-center gap-2 rounded-[18px] border border-violet-100 bg-white p-1.5 shadow-sm focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400"
                title="Dán ảnh trực tiếp vào ô nhập"
              >
                <FiPaperclip className="h-[17px] w-[17px]" />
              </span>
              <input
                value={input}
                onChange={(event) => controller.setInput(event.target.value)}
                onPaste={controller.handlePasteImage}
                onFocus={controller.keepMobileViewportStable}
                placeholder={cooldownSeconds > 0 ? `Thử lại sau ${cooldownSeconds}s` : 'Hỏi Moly Pet…'}
                disabled={loading || cooldownSeconds > 0}
                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={
                  loading ||
                  processingImage ||
                  cooldownSeconds > 0 ||
                  (!input.trim() && !pastedImage)
                }
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Gửi tin nhắn"
              >
                <FiSend className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      )}

      <div
        className={`fixed z-[65] h-[72px] w-[72px] select-none ${open ? 'z-[95]' : ''}`}
        style={containerStyle}
      >
        {showHintBubble && (
          <div
            className={`pointer-events-none absolute top-2 ${bubbleSideClass} w-max max-w-52 rounded-2xl border border-violet-100 bg-white/95 px-3 py-2 text-xs font-bold text-slate-600 shadow-xl backdrop-blur`}
          >
            {routeHint}
          </div>
        )}
        <button
          type="button"
          onPointerDown={controller.handlePetPointerDown}
          onPointerMove={controller.handlePetPointerMove}
          onPointerUp={controller.handlePetPointerUp}
          onPointerCancel={controller.handlePetPointerUp}
          onClick={controller.toggleFromPetClick}
          className="group relative h-full w-full cursor-grab touch-none rounded-full outline-none active:cursor-grabbing focus-visible:ring-4 focus-visible:ring-violet-300/70"
          aria-label={open ? 'Đóng Moly Pet' : 'Mở Moly Pet'}
        >
          <span className="relative flex h-full w-full scale-[0.82] items-center justify-center transition-transform duration-300 group-hover:scale-[0.88]">
            <PetFace
              color={settings.color}
              variant={settings.variant}
              mood={petMood}
              walking={walking || dragging}
              facing={facing}
              waving={false}
            />
          </span>
        </button>
      </div>
    </>
  );
}

MolyPetRoot.propTypes = {
  defaultPosition: PropTypes.oneOf(['left', 'right']),
};
