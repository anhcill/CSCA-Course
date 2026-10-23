import usePersistentClassSelectionBase from "../../../hooks/usePersistentClassSelection";

export default function usePersistentClassSelection(options) {
  return usePersistentClassSelectionBase({
    ...options,
    storageNamespace: "student",
  });
}
