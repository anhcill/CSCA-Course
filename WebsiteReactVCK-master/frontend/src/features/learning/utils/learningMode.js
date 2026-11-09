const MODE_KEYS = [
  "learning_mode",
  "learningMode",
  "enrollment_mode",
  "enrollmentMode",
  "delivery_mode",
  "deliveryMode",
];

export const normalizeLearningMode = (value) => {
  const normalized = String(value || "LIVE").trim().toUpperCase();
  return normalized === "RECORDING" || normalized === "RECORD" ? "RECORDING" : "LIVE";
};

export const getLearningMode = (...sources) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of MODE_KEYS) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
        return normalizeLearningMode(source[key]);
      }
    }
  }
  return "LIVE";
};

export const isRecordingMode = (...sources) => getLearningMode(...sources) === "RECORDING";

export const getLearningCapabilities = (workspace = {}) => {
  const selectedClass = workspace.selectedClass || {};
  const access = workspace.access || {};
  const classCapabilities = selectedClass.capabilities || {};
  const recordingMode = isRecordingMode(selectedClass, access, workspace);
  const explicit = (camelKey, snakeKey, fallback) => {
    const value = classCapabilities[camelKey]
      ?? classCapabilities[snakeKey]
      ?? access[camelKey]
      ?? access[snakeKey];
    return value === undefined ? fallback : Boolean(value);
  };

  return {
    learningMode: recordingMode ? "RECORDING" : "LIVE",
    recordingMode,
    canJoinLive: explicit("canJoinLive", "can_join_live", !recordingMode),
    canCheckIn: explicit("canCheckIn", "can_check_in", !recordingMode),
    showCalendar: explicit("showCalendar", "show_calendar", !recordingMode),
    prioritizeRecordings: explicit("prioritizeRecordings", "prioritize_recordings", recordingMode),
  };
};
