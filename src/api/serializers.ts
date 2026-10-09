import type { Model, ModelWithProvider } from "../services/model.service";
import type { ProviderPublic } from "../services/provider.service";
import { avatarMediaUrl, isDataAvatar } from "../services/avatar.service";

/** Maps a persisted custom avatar to its public URL: data URLs become media URLs. */
function publicCustomAvatar(value: string | null, ownerId: string): string | null {
  if (value == null || value === "") return null;
  return isDataAvatar(value) ? avatarMediaUrl(ownerId, value) : value;
}

export function serializeProvider(
  provider: ProviderPublic,
  options: { includeAvatarOverride?: boolean } = {},
) {
  return {
    id: provider.id,
    name: provider.name,
    base_url: provider.base_url,
    avatar: provider.avatar,
    avatar_sources: provider.avatar_sources,
    ...(options.includeAvatarOverride
      ? { avatar_override: publicCustomAvatar(provider.avatar_override, provider.id) }
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
    use_litellm_pricing: model.use_litellm_pricing,
    created_at: model.created_at,
    updated_at: model.updated_at,
    context_window: model.context_window,
    max_output_tokens: model.max_output_tokens,
    max_output_tokens_source: model.max_output_tokens_source ?? (model.is_manual ? "manual" : "api"),
    max_output_tokens_is_default: model.max_output_tokens_is_default ?? model.max_output_tokens_source === "auto",
    think_opening_tag_mode: model.think_opening_tag_mode,
    fix_missing_think_opening_tag: model.fix_missing_think_opening_tag,
    capabilities: model.capabilities,
    reasoning_efforts: model.reasoning_efforts,
    pricing_tiers: model.pricing_tiers,
    pricing_source: model.pricing_source,
    catalog_pricing: model.catalog_pricing,
  };
}

export function serializeModelWithProvider(model: ModelWithProvider) {
  return {
    ...serializeModel(model),
    provider_name: model.provider_name,
    provider_avatar: model.provider_avatar,
    provider_avatar_sources: model.provider_avatar_sources,
  };
}
