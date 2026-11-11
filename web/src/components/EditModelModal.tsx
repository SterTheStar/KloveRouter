import { ModelModal } from "./models/ModelModal";
import type { Model } from "../types";

export default function EditModelModal({
  isOpen,
  model,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  model: Model | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return (
    <ModelModal
      mode="edit"
      isOpen={isOpen}
      model={model}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
