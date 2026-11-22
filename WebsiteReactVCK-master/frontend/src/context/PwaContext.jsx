import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  checkIsPwaInstalled,
  clearPwaInstalledFlag,
  detectDesktopSafari,
  detectIosDevice,
  isStandaloneDisplayMode,
  recordPwaInstalled,
  recordPwaPromptDismissed,
  shouldShowPwaReminder,
} from "../utils/pwaInstall.js";

const PwaContext = createContext({
  isInstalled: false,
  isStandalone: false,
  canPromptInstall: false,
  isIos: false,
  isIosSafari: false,
  isDesktopSafari: false,
  shouldShowBanner: false,
  installing: false,
  promptInstall: async () => ({ outcome: "unavailable" }),
  dismissBanner: () => {},
});

export function PwaProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(() => (
    typeof window !== "undefined" ? window.__pwaDeferredPrompt || null : null
  ));
  const [isStandalone, setIsStandalone] = useState(() => isStandaloneDisplayMode());
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
  const [statusChecked, setStatusChecked] = useState(false);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [installing, setInstalling] = useState(false);

  const { isIos, isIosSafari } = useMemo(() => detectIosDevice(), []);
  const isDesktopSafari = useMemo(() => detectDesktopSafari(), []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let active = true;

    const syncInstallStatus = async () => {
      const standaloneNow = isStandaloneDisplayMode();
      if (!active) return;
      setIsStandalone(standaloneNow);

      // Nếu trình duyệt đã phát beforeinstallprompt ở chế độ trình duyệt thường,
      // nghĩa là PWA hiện chưa được cài (kể cả khi trước đây user từng cài rồi gỡ).
      if (!standaloneNow && window.__pwaDeferredPrompt) {
        clearPwaInstalledFlag();
        setDeferredPrompt(window.__pwaDeferredPrompt);
        setIsInstalled(false);
        setStatusChecked(true);
        return;
      }

      const installed = await checkIsPwaInstalled();
      if (!active) return;
      setIsInstalled(installed);
      setStatusChecked(true);
    };

    syncInstallStatus();

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      window.__pwaDeferredPrompt = event;
      setDeferredPrompt(event);

      if (!isStandaloneDisplayMode()) {
        clearPwaInstalledFlag();
        setIsInstalled(false);
      }
      setStatusChecked(true);
    };

    const handleAppInstalled = () => {
      window.__pwaDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      setDismissedThisSession(true);
      recordPwaInstalled();
      toast.success("Ứng dụng Moly Course đã được cài đặt thành công!");
    };

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const handleDisplayModeChange = (event) => {
      if (event.matches) {
        setIsStandalone(true);
        setIsInstalled(true);
        recordPwaInstalled();
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    standaloneQuery?.addEventListener?.("change", handleDisplayModeChange);

    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery?.removeEventListener?.("change", handleDisplayModeChange);
    };
  }, []);

  const dismissBanner = useCallback(() => {
    setDismissedThisSession(true);
    recordPwaPromptDismissed();
  }, []);

  const promptInstall = useCallback(async () => {
    const promptEvent = deferredPrompt || (typeof window !== "undefined" ? window.__pwaDeferredPrompt : null);
    if (!promptEvent) {
      return { outcome: "unavailable" };
    }

    try {
      setInstalling(true);
      await promptEvent.prompt();
      const choiceResult = await promptEvent.userChoice;
      const outcome = choiceResult?.outcome || "dismissed";

      // BeforeInstallPromptEvent chỉ dùng được 1 lần trên mỗi lần tải trang
      window.__pwaDeferredPrompt = null;
      setDeferredPrompt(null);

      if (outcome === "accepted") {
        setIsInstalled(true);
        setDismissedThisSession(true);
        recordPwaInstalled();
      } else {
        setDismissedThisSession(true);
        recordPwaPromptDismissed();
      }

      return { outcome };
    } catch {
      return { outcome: "error" };
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const canPromptInstall = Boolean(deferredPrompt) && !isInstalled && !isStandalone;

  const shouldShowBanner = useMemo(() => {
    if (!statusChecked || isInstalled || isStandalone || dismissedThisSession) {
      return false;
    }
    if (!canPromptInstall && !isIos) {
      return false;
    }
    return shouldShowPwaReminder({ isInstalled: false });
  }, [statusChecked, isInstalled, isStandalone, dismissedThisSession, canPromptInstall, isIos]);

  const value = useMemo(
    () => ({
      isInstalled,
      isStandalone,
      canPromptInstall,
      isIos,
      isIosSafari,
      isDesktopSafari,
      shouldShowBanner,
      installing,
      promptInstall,
      dismissBanner,
    }),
    [
      isInstalled,
      isStandalone,
      canPromptInstall,
      isIos,
      isIosSafari,
      isDesktopSafari,
      shouldShowBanner,
      installing,
      promptInstall,
      dismissBanner,
    ],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export const usePwaInstall = () => useContext(PwaContext);

export default PwaContext;
