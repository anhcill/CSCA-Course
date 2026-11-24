import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../context/AuthContext";

const readStoredValue = (storageKey, fallbackValue) => {
  if (!storageKey) return fallbackValue;
  try {
    return window.localStorage.getItem(storageKey) || fallbackValue;
  } catch {
    return fallbackValue;
  }
};

const writeStoredValue = (storageKey, value) => {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // The filter still works for the current visit when storage is unavailable.
  }
};

export default function usePersistentClassSelection({
  storageNamespace,
  scope,
  availableClassIds = [],
  allValue = "ALL",
  ready = true,
  preferredValue = null,
  shareLastActive = false,
}) {
  const { authUser } = useAuthContext();
  const userId = authUser?.id ?? authUser?._id ?? null;
  const storageKey = userId && storageNamespace
    ? `csca:lms:${storageNamespace}-class-filter:${userId}:${scope}`
    : null;
  const sharedStorageKey = userId && storageNamespace && shareLastActive
    ? `csca:lms:${storageNamespace}-active-class:${userId}`
    : null;
  const hasPreferredValue = preferredValue !== null && preferredValue !== undefined && preferredValue !== "";
  const normalizedPreferredValue = hasPreferredValue ? String(preferredValue) : null;
  const normalizedAllValue = String(allValue);

  const resolveInitialStoredValue = useCallback(() => {
    const scopedValue = readStoredValue(storageKey, null);
    if (scopedValue !== null) return scopedValue;
    const sharedValue = readStoredValue(sharedStorageKey, null);
    return sharedValue !== null ? sharedValue : normalizedAllValue;
  }, [normalizedAllValue, sharedStorageKey, storageKey]);

  const [selectedClassId, setSelectedClassIdState] = useState(() => (
    normalizedPreferredValue || resolveInitialStoredValue()
  ));

  const availableClassIdSet = useMemo(
    () => new Set(availableClassIds.map((classId) => String(classId))),
    [availableClassIds],
  );

  useEffect(() => {
    if (!storageKey || normalizedPreferredValue !== null) return;
    setSelectedClassIdState(resolveInitialStoredValue());
  }, [normalizedPreferredValue, resolveInitialStoredValue, storageKey]);

  useEffect(() => {
    if (normalizedPreferredValue === null) return;
    setSelectedClassIdState(normalizedPreferredValue);
    writeStoredValue(storageKey, normalizedPreferredValue);
    if (sharedStorageKey && normalizedPreferredValue !== normalizedAllValue) {
      writeStoredValue(sharedStorageKey, normalizedPreferredValue);
    }
  }, [normalizedAllValue, normalizedPreferredValue, sharedStorageKey, storageKey]);

  useEffect(() => {
    if (!ready || selectedClassId === normalizedAllValue) return;
    if (availableClassIdSet.has(String(selectedClassId))) return;
    setSelectedClassIdState(normalizedAllValue);
    writeStoredValue(storageKey, normalizedAllValue);
  }, [availableClassIdSet, normalizedAllValue, ready, selectedClassId, storageKey]);

  const setSelectedClassId = useCallback((valueOrUpdater) => {
    setSelectedClassIdState((currentValue) => {
      const value = typeof valueOrUpdater === "function"
        ? valueOrUpdater(currentValue)
        : valueOrUpdater;
      const normalizedValue = value === null || value === undefined || value === ""
        ? normalizedAllValue
        : String(value);
      writeStoredValue(storageKey, normalizedValue);
      if (sharedStorageKey && normalizedValue !== normalizedAllValue) {
        writeStoredValue(sharedStorageKey, normalizedValue);
      }
      return normalizedValue;
    });
  }, [normalizedAllValue, sharedStorageKey, storageKey]);

  return [selectedClassId, setSelectedClassId];
}
