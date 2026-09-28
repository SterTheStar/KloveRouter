import type { Model } from "../types";

export function modelPublicId(model: Pick<Model, "model_id" | "pretty_id"> & { provider_name: string }): string {
  if ((model as any).model_pool || model.provider_name.toLowerCase() === "pool") return `pool/${model.pretty_id || model.model_id}`;
  return `${model.provider_name.toLowerCase().replace(/\s+/g, "")}/${model.pretty_id || model.model_id}`;
}

export function modelDisplayId(model: Pick<Model, "model_id" | "pretty_id">): string {
  return model.pretty_id || model.model_id;
}
