import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../../../context/AuthContext";

const STORAGE_PREFIX = "csca:lms:student-class-filter";

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
  scope,
  availableClassIds = [],
  allValue = "ALL",
  ready = true,
  preferredValue = null,
}) {
  const { authUser } = useAuthContext();
  const userId = authUser?.id ?? authUser?._id ?? null;
  const storageKey = userId ? `${STORAGE_PREFIX}:${userId}:${scope}` : null;
  const hasPreferredValue = preferredValue !== null && preferredValue !== undefined && preferredValue !== "";
  const normalizedPreferredValue = hasPreferredValue ? String(preferredValue) : null;
  const normalizedAllValue = String(allValue);

  const [selectedClassId, setSelectedClassIdState] = useState(() => (
    normalizedPreferredValue || readStoredValue(storageKey, normalizedAllValue)
  ));

  const availableClassIdSet = useMemo(
    () => new Set(availableClassIds.map((classId) => String(classId))),
    [availableClassIds],
  );

  useEffect(() => {
    if (!storageKey || normalizedPreferredValue !== null) return;
    setSelectedClassIdState(readStoredValue(storageKey, normalizedAllValue));
  }, [normalizedAllValue, normalizedPreferredValue, storageKey]);

  useEffect(() => {
    if (normalizedPreferredValue === null) return;
    setSelectedClassIdState(normalizedPreferredValue);
    writeStoredValue(storageKey, normalizedPreferredValue);
  }, [normalizedPreferredValue, storageKey]);

  useEffect(() => {
    if (!ready || selectedClassId === normalizedAllValue) return;
    if (availableClassIdSet.has(String(selectedClassId))) return;
    setSelectedClassIdState(normalizedAllValue);
    writeStoredValue(storageKey, normalizedAllValue);
  }, [availableClassIdSet, normalizedAllValue, ready, selectedClassId, storageKey]);

  const setSelectedClassId = useCallback((value) => {
    const normalizedValue = value === null || value === undefined || value === ""
      ? normalizedAllValue
      : String(value);
    setSelectedClassIdState(normalizedValue);
    writeStoredValue(storageKey, normalizedValue);
  }, [normalizedAllValue, storageKey]);

  return [selectedClassId, setSelectedClassId];
}
