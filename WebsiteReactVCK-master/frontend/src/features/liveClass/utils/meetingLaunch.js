// Reserve the target window inside the click event, before the access API is
// awaited. Browsers otherwise commonly treat window.open after an async call
// as a popup and block the one-click Zoom/Meet flow.
export const reserveMeetingWindow = () => {
  const meetingWindow = window.open("", "_blank");
  if (meetingWindow) meetingWindow.opener = null;
  return meetingWindow;
};

export const openReservedMeeting = (meetingWindow, meetingUrl) => {
  if (meetingWindow && !meetingWindow.closed) {
    meetingWindow.location.replace(meetingUrl);
    return;
  }
  // If a browser blocks the auxiliary tab, preserve a working one-click
  // fallback instead of silently doing nothing.
  window.location.assign(meetingUrl);
};

export const closeReservedMeeting = (meetingWindow) => {
  if (meetingWindow && !meetingWindow.closed) meetingWindow.close();
};
