/** @deprecated Import protocol conversion helpers from `src/sdk/protocol-converter`. */
export {
  chatCompletionToResponse,
  chatSseToResponses,
} from "../sdk/protocol-converter";

import { requestToChat } from "../sdk/protocol-converter";

/** @deprecated Use `requestToChat("responses", body)` instead. */
export function responsesToChatBody(body: unknown) {
  return requestToChat("responses", body);
}
