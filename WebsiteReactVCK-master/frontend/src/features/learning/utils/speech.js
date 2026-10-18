export function speakChinese(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = "zh-CN";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn("Chinese text-to-speech failed:", error);
  }
}
