import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '../../../context/AuthContext.jsx';
import { getClipboardImageFile, preparePastedChatImage } from './chatImagePaste.js';
import {
  HIDDEN_UNTIL_KEY,
  PET_FRAME_SIZE,
  PET_PANEL_MARGIN,
  PET_PANEL_MAX_WIDTH,
  SETTINGS_DEFAULTS_VERSION,
  SETTINGS_KEY,
  clampPetPoint,
  getFirstName,
  getInitialPetPoint,
  getRouteHint,
  getStudyContext,
  readSettings,
  savePetPoint,
} from './constants.js';

export function useMoliPetController({ defaultPosition = 'left' } = {}) {
  const location = useLocation();
  const pathname = location?.pathname || '/';
  const { authUser, isAuthenticated } = useAuthContext();
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => readSettings(defaultPosition));
  const [input, setInput] = useState('');
  const [pastedImage, setPastedImage] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(0);
  const [messages, setMessages] = useState([]);
  const [petPoint, setPetPoint] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState(defaultPosition);
  const [visualViewportFrame, setVisualViewportFrame] = useState({ height: 0, offsetTop: 0 });
  const messagesScrollRef = useRef(null);
  const walkTimeoutRef = useRef(null);
  const dragRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const userName = getFirstName(authUser?.display_name || authUser?.name || authUser?.fullName || authUser?.username);
  const routeHint = useMemo(() => getRouteHint(pathname), [pathname]);
  const studyContext = useMemo(() => getStudyContext(pathname), [pathname]);
  const isVocabularyRoute = pathname?.includes('tu-vung') ?? false;
  const petMood = isVocabularyRoute ? 'happy' : settings.mood;
  const showHintBubble = settings.showBubble && !open && !isVocabularyRoute;
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000));

  useEffect(() => {
    const nextSettings = readSettings(defaultPosition);
    const hiddenUntil = Number(window.localStorage.getItem(HIDDEN_UNTIL_KEY) || 0);
    setSettings(nextSettings);
    setPetPoint(getInitialPetPoint(nextSettings.position));
    setHidden(hiddenUntil > Date.now());
    setMessages([
      {
        role: 'assistant',
        content: isAuthenticated
          ? `Chào ${userName}, mình là ${nextSettings.name}. ${getRouteHint(pathname)}`
          : `Chào bạn, mình là ${nextSettings.name}. Đăng nhập rồi mình trò chuyện thông minh hơn nha.`,
      },
    ]);
    setMounted(true);
  }, [defaultPosition, isAuthenticated, pathname, userName]);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...settings,
        defaultsVersion: SETTINGS_DEFAULTS_VERSION,
      })
    );
  }, [mounted, settings]);

  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    setCooldownNow(Date.now());
    const timer = window.setInterval(() => setCooldownNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    const scrollContainer = messagesScrollRef.current;
    if (!scrollContainer) return;
    const scrollToBottom = () => {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'auto',
      });
    };
    window.requestAnimationFrame(scrollToBottom);
    const timer = window.setTimeout(scrollToBottom, 80);
    return () => window.clearTimeout(timer);
  }, [messages, loading, open]);

  useEffect(() => {
    if (!mounted) return;
    const handleResize = () => {
      setPetPoint((current) => {
        if (!current) return current;
        const next = clampPetPoint(current);
        savePetPoint(next);
        return next;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;

    const syncVisualViewport = () => {
      const viewport = window.visualViewport;
      setVisualViewportFrame({
        height: viewport?.height || window.innerHeight,
        offsetTop: viewport?.offsetTop || 0,
      });
    };

    syncVisualViewport();
    window.visualViewport?.addEventListener('resize', syncVisualViewport);
    window.visualViewport?.addEventListener('scroll', syncVisualViewport);
    window.addEventListener('resize', syncVisualViewport);

    return () => {
      window.visualViewport?.removeEventListener('resize', syncVisualViewport);
      window.visualViewport?.removeEventListener('scroll', syncVisualViewport);
      window.removeEventListener('resize', syncVisualViewport);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || hidden || open || dragging || !settings.motion) {
      if (walkTimeoutRef.current) {
        clearTimeout(walkTimeoutRef.current);
        walkTimeoutRef.current = null;
      }
      setWalking(false);
      return;
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const walk = () => {
      setPetPoint((current) => {
        if (!current) return current;

        const edgeDirection =
          current.x > window.innerWidth * 0.72
            ? -1
            : current.x < window.innerWidth * 0.18
              ? 1
              : Math.random() > 0.5
                ? 1
                : -1;
        const distance = 72 + Math.random() * 128;
        const next = clampPetPoint({
          x: current.x + edgeDirection * distance,
          y: current.y + (Math.random() - 0.5) * 42,
        });

        setFacing(next.x >= current.x ? 'right' : 'left');
        setWalking(true);
        savePetPoint(next);

        if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
        walkTimeoutRef.current = setTimeout(() => {
          setWalking(false);
          walkTimeoutRef.current = null;
        }, 950);

        return next;
      });
    };

    const startTimer = setTimeout(walk, 1500);
    const interval = setInterval(walk, 5800);

    return () => {
      clearTimeout(startTimer);
      clearInterval(interval);
      if (walkTimeoutRef.current) {
        clearTimeout(walkTimeoutRef.current);
        walkTimeoutRef.current = null;
      }
    };
  }, [mounted, hidden, open, dragging, settings.motion]);

  const updateSettings = (patch) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const movePetToSide = (position) => {
    if (!petPoint) return;
    const nextPoint = clampPetPoint({
      x: position === 'right' ? window.innerWidth - PET_FRAME_SIZE - 20 : 20,
      y: petPoint.y,
    });
    updateSettings({ position });
    setPetPoint(nextPoint);
    savePetPoint(nextPoint);
  };

  const restorePet = () => {
    window.localStorage.removeItem(HIDDEN_UNTIL_KEY);
    setHidden(false);
    setPetPoint((current) => current || getInitialPetPoint(settings.position));
    setOpen(true);
    setMinimized(false);
  };

  const hideForDay = () => {
    window.localStorage.setItem(HIDDEN_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    setHidden(true);
  };

  const keepMobileViewportStable = () => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) return;
    const keepPanelPinned = () => {
      const el = messagesScrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    window.requestAnimationFrame(keepPanelPinned);
    window.setTimeout(keepPanelPinned, 120);
    window.setTimeout(keepPanelPinned, 280);
  };

  const handlePasteImage = async (event) => {
    if (loading || processingImage) return;
    const file = getClipboardImageFile(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    try {
      setProcessingImage(true);
      setPastedImage(await preparePastedChatImage(file));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể đọc ảnh.');
    } finally {
      setProcessingImage(false);
    }
  };

  const sendMessage = async (event) => {
    event?.preventDefault?.();
    const text = input.trim();
    const imageSnapshot = pastedImage;
    const messageText = text || (imageSnapshot ? 'Mình gửi ảnh này, bạn xem giúp mình nhé.' : '');
    if ((!messageText && !imageSnapshot) || loading || processingImage) return;
    if (cooldownSeconds > 0) return;

    const nextMessages = [...messages, { role: 'user', content: messageText, imageDataUrl: imageSnapshot?.dataUrl }];
    setMessages(nextMessages);
    setInput('');
    setPastedImage(null);

    if (!isAuthenticated) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: `Bạn đăng nhập xong ${settings.name} mới dùng AI để trò chuyện được nha.` },
      ]);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/ai/moli-pet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: messageText,
          imageDataUrl: imageSnapshot?.dataUrl,
          page: pathname,
          pageType: studyContext.pageType,
          subject: studyContext.subject,
          routeHint,
          localTime: new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', weekday: 'long' }),
          petName: settings.name,
          mood: settings.mood,
          conversationHistory: nextMessages.slice(-6).map((item) => ({
            role: item.role,
            content: item.content,
          })),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent('csca:session-expired'));
        }
        const errorData = await response.json().catch(() => null);
        const requestError = new Error(errorData?.answer || errorData?.message || `${settings.name} bị nghẽn xíu. Bạn thử lại sau nha.`);
        requestError.retryAfter = errorData?.retryAfter;
        throw requestError;
      }
      if (!response.body) throw new Error('Không nhận được phản hồi từ Moly.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let fullContent = '';
      let streamDone = false;

      const showStreamedContent = (content) => {
        setMessages((current) => {
          const lastMessage = current[current.length - 1];
          if (lastMessage?.role === 'assistant') {
            return [...current.slice(0, -1), { ...lastMessage, content }];
          }
          return [...current, { role: 'assistant', content }];
        });
      };

      while (!streamDone) {
        const { value, done } = await reader.read();
        if (value) pending += decoder.decode(value, { stream: !done });
        if (done) pending += decoder.decode();
        const lines = pending.split(/\r?\n/);
        pending = done ? '' : (lines.pop() || '');

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === '[DONE]') {
            streamDone = true;
            break;
          }
          let parsed;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          if (parsed?.error) throw new Error(String(parsed.error));
          const content = parsed?.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content) {
            fullContent += content;
            showStreamedContent(fullContent);
          }
        }
        if (done) break;
      }

      if (!fullContent.trim()) throw new Error(`${settings.name} chưa trả lời được. Bạn thử lại nhé.`);
    } catch (error) {
      const retryAfter = Number(error?.retryAfter || 0);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setCooldownUntil(Date.now() + retryAfter * 1000);
      }
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: error?.message || `${settings.name} bị nghẽn xíu. Bạn thử lại sau nha.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const viewportWidth = mounted && typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = mounted && typeof window !== 'undefined' ? window.innerHeight : 0;
  const isMobileViewport = viewportWidth < 640;
  const panelStyle = {};
  const containerStyle = {};
  let bubbleSideClass = 'left-20';

  if (mounted && petPoint && typeof window !== 'undefined') {
    const mobileViewportHeight = visualViewportFrame.height || viewportHeight;
    const mobilePanelHeight = Math.min(
      620,
      Math.max(320, mobileViewportHeight * 0.82),
      Math.max(280, mobileViewportHeight - PET_PANEL_MARGIN * 2),
    );
    const mobilePanelTop = visualViewportFrame.offsetTop + Math.max(
      PET_PANEL_MARGIN,
      mobileViewportHeight - mobilePanelHeight - PET_PANEL_MARGIN,
    );
    const dockedRight = petPoint.x > viewportWidth / 2;
    const panelWidth = Math.min(PET_PANEL_MAX_WIDTH, Math.max(220, viewportWidth - PET_PANEL_MARGIN * 2));
    const maxPanelLeft = Math.max(PET_PANEL_MARGIN, viewportWidth - panelWidth - PET_PANEL_MARGIN);
    const preferredPanelLeft = dockedRight ? petPoint.x + PET_FRAME_SIZE - panelWidth : petPoint.x;
    const panelLeft = Math.min(Math.max(PET_PANEL_MARGIN, preferredPanelLeft), maxPanelLeft);
    const minPanelHeight = Math.min(240, Math.max(180, viewportHeight - PET_PANEL_MARGIN * 2));
    const openPanelBelowPet = petPoint.y < viewportHeight * 0.45;
    const panelTop = openPanelBelowPet
      ? Math.min(
          Math.max(PET_PANEL_MARGIN, petPoint.y + PET_FRAME_SIZE + PET_PANEL_MARGIN),
          Math.max(PET_PANEL_MARGIN, viewportHeight - minPanelHeight - PET_PANEL_MARGIN),
        )
      : undefined;
    const panelBottom = openPanelBelowPet
      ? undefined
      : Math.min(
          Math.max(PET_PANEL_MARGIN, viewportHeight - petPoint.y + PET_PANEL_MARGIN),
          Math.max(PET_PANEL_MARGIN, viewportHeight - minPanelHeight - PET_PANEL_MARGIN),
        );
    const panelAvailableHeight = openPanelBelowPet
      ? viewportHeight - (panelTop ?? PET_PANEL_MARGIN) - PET_PANEL_MARGIN
      : viewportHeight - (panelBottom ?? PET_PANEL_MARGIN) - PET_PANEL_MARGIN;
    const desktopPanelHeight = Math.max(180, Math.min(620, panelAvailableHeight));
    const desktopPanelStyle = {
      left: panelLeft,
      width: panelWidth,
      height: desktopPanelHeight,
      maxHeight: desktopPanelHeight,
      ...(openPanelBelowPet ? { top: panelTop } : { bottom: panelBottom }),
    };
    const mobilePanelStyle = {
      left: PET_PANEL_MARGIN,
      right: PET_PANEL_MARGIN,
      top: mobilePanelTop,
      width: 'auto',
      height: mobilePanelHeight,
      maxHeight: mobilePanelHeight,
    };
    Object.assign(panelStyle, isMobileViewport ? mobilePanelStyle : desktopPanelStyle);
    Object.assign(containerStyle, {
      left: petPoint.x,
      top: petPoint.y,
      transition: dragging ? 'none' : 'left 950ms cubic-bezier(.34,1.56,.64,1), top 950ms ease',
    });
    bubbleSideClass = dockedRight ? 'right-20' : 'left-20';
  }

  const handlePetPointerDown = (event) => {
    if (!petPoint || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: petPoint.x,
      originY: petPoint.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePetPointerMove = (event) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const dragThreshold = event.pointerType === 'touch' || isMobileViewport ? 10 : 4;
    if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
      drag.moved = true;
      if (deltaX !== 0) setFacing(deltaX > 0 ? 'right' : 'left');
    }
    if (!drag.moved) return;
    setPetPoint(clampPetPoint({ x: drag.originX + deltaX, y: drag.originY + deltaY }));
  };

  const handlePetPointerUp = (event) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    if (!drag.moved) {
      dragRef.current.pointerId = null;
      setDragging(false);
      return;
    }
    const nextPoint = clampPetPoint({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
    setPetPoint(nextPoint);
    savePetPoint(nextPoint);
    updateSettings({ position: nextPoint.x > window.innerWidth / 2 ? 'right' : 'left' });
    if (event.clientX !== drag.startX) setFacing(event.clientX > drag.startX ? 'right' : 'left');
    dragRef.current.pointerId = null;
    setDragging(false);
  };

  const toggleFromPetClick = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    setOpen((value) => !value);
    setMinimized(false);
  };

  return {
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
    isAuthenticated,
    isVocabularyRoute,
    updateSettings,
    movePetToSide,
    restorePet,
    hideForDay,
    setOpen,
    setMinimized,
    setSettingsOpen,
    setInput,
    clearPastedImage: () => setPastedImage(null),
    keepMobileViewportStable,
    handlePasteImage,
    sendMessage,
    handlePetPointerDown,
    handlePetPointerMove,
    handlePetPointerUp,
    toggleFromPetClick,
  };
}
