import type { Model, ModelWithProvider } from "../services/model.service";
import type { ProviderPublic } from "../services/provider.service";

function isDataImage(value: string | null | undefined): boolean {
  return value?.startsWith("data:image/") === true;
}

function compactAvatarSources(
  avatar: string | null,
  sources: string[],
): string[] {
  return sources.filter((source) => source !== avatar && !isDataImage(source));
}

function compactAvatar(value: string | null): string | null {
  return isDataImage(value) ? null : value;
}

export function serializeProvider(
  provider: ProviderPublic,
  options: { includeAvatarOverride?: boolean } = {},
) {
  const avatar = compactAvatar(provider.avatar);
  return {
    id: provider.id,
    name: provider.name,
    base_url: provider.base_url,
    avatar,
    avatar_sources: compactAvatarSources(provider.avatar, provider.avatar_sources),
    ...(options.includeAvatarOverride
      ? { avatar_override: provider.avatar_override }
      : {}),
    protocol: provider.protocol,
    credential_mode: provider.credential_mode,
    fixed_credential_id: provider.fixed_credential_id,
    is_active: provider.is_active,
    created_at: provider.created_at,
    updated_at: provider.updated_at,
  };
}

export function serializeModel(model: Model) {
  return {
    id: model.id,
    provider_id: model.provider_id,
    model_id: model.model_id,
    pretty_id: model.pretty_id,
    display_name: model.display_name,
    is_manual: model.is_manual,
    is_active: model.is_active,
    created_at: model.created_at,
    updated_at: model.updated_at,
    context_window: model.context_window,
    max_output_tokens: model.max_output_tokens,
    capabilities: model.capabilities,
    reasoning_efforts: model.reasoning_efforts,
    pricing_tiers: model.pricing_tiers,
  };
}

export function serializeModelWithProvider(model: ModelWithProvider) {
  const providerAvatar = compactAvatar(model.provider_avatar);
  return {
    ...serializeModel(model),
    provider_name: model.provider_name,
    provider_avatar: providerAvatar,
    provider_avatar_sources: compactAvatarSources(
      providerAvatar,
      model.provider_avatar_sources,
    ),
  };
}
