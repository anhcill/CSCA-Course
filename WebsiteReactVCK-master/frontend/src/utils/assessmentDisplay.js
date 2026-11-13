const assessmentRoutes = [
  /^\/quizzes\/[^/]+\/?$/,
  /^\/assignments\/[^/]+\/submit\/?$/,
  /^\/lms\/quiz\/[^/]+\/?$/,
  /^\/lms\/quizzes\/(?!gallery(?:\/|$))[^/]+(?:\/moli)?\/?$/,
  /^\/lms\/assignments?\/[^/]+\/submit\/?$/,
  /^\/lms\/courses\/[^/]+\/classes\/[^/]+\/quizzes\/[^/]+\/?$/,
  /^\/lms\/courses\/[^/]+\/classes\/[^/]+\/assignments\/[^/]+\/submit\/?$/,
];

export const isAssessmentPath = (pathname) => assessmentRoutes.some((route) => route.test(pathname));

let ownsFullscreen = false;
let pendingFullscreen = null;

export const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

// Invoke directly from the launch click: browsers require transient user activation.
export function enterAssessmentFullscreen(event) {
  if (event && (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    || (event.button !== undefined && event.button !== 0))) return;
  if (getFullscreenElement() || pendingFullscreen) return;
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;
  try {
    ownsFullscreen = true;
    pendingFullscreen = Promise.resolve(request.call(root))
      .catch(() => { ownsFullscreen = false; })
      .finally(() => { pendingFullscreen = null; });
  } catch {
    ownsFullscreen = false;
  }
}

export async function exitAssessmentFullscreen() {
  if (pendingFullscreen) await pendingFullscreen;
  if (!ownsFullscreen) return;
  ownsFullscreen = false;
  if (getFullscreenElement() !== document.documentElement) return;
  try {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    await exit?.call(document);
  } catch {
    // Keep navigation usable when fullscreen is denied or already closed.
  }
}

export async function toggleAssessmentFullscreen() {
  if (!getFullscreenElement()) {
    enterAssessmentFullscreen();
    return;
  }
  try {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    await exit?.call(document);
  } catch {
    // The dedicated assessment layout remains usable without native fullscreen.
  }
}
