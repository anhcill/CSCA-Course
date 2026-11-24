import usePersistentClassSelectionBase from "../../../hooks/usePersistentClassSelection";

export default function usePersistentClassSelection(options) {
  return usePersistentClassSelectionBase({
    shareLastActive: true,
    ...options,
    storageNamespace: "student",
  });
}
