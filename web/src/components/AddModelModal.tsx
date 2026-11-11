import { ModelModal } from "./models/ModelModal";
import type { ProviderBillingType } from "../types";

export {
  emptyModelMetadata,
  modelFormTabsFor,
  PricingEditor,
} from "./models";
export { GenerationTab as MediaSettingsEditor } from "./models";
export { CapabilitiesTab as ModelMetadataEditor } from "./models";
export { OutputFixesTab as ThinkTagModeEditor } from "./models";

export default function AddModelModal({
  isOpen,
  onClose,
  onSuccess,
  providerId,
  providerBillingType,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providerId: string;
  providerBillingType?: ProviderBillingType;
}) {
  return (
    <ModelModal
      mode="create"
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      providerId={providerId}
      providerBillingType={providerBillingType}
    />
  );
}
