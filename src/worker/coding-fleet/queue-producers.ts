import {
  createCodingRequestMessage,
  InvalidCodingRequestError,
  type CodingProducerPrincipal,
  type CodingRequestInput,
  type CodingRequestMessage,
  type CodingRequestSource,
} from "./contracts";

export interface CodingRequestQueue {
  send(message: CodingRequestMessage): Promise<void>;
}

async function enqueueFromSource(
  source: CodingRequestSource,
  queue: CodingRequestQueue,
  principal: CodingProducerPrincipal,
  input: unknown,
): Promise<CodingRequestMessage> {
  if (principal.source !== source) {
    throw new InvalidCodingRequestError(["producer source"]);
  }

  const message = createCodingRequestMessage(principal, input);
  await queue.send(message);
  return message;
}

export function enqueueUiCodingRequest(
  queue: CodingRequestQueue,
  principal: CodingProducerPrincipal & { source: "ui" },
  input: CodingRequestInput,
): Promise<CodingRequestMessage> {
  return enqueueFromSource("ui", queue, principal, input);
}

export function enqueueGitHubCodingRequest(
  queue: CodingRequestQueue,
  principal: CodingProducerPrincipal & { source: "github" },
  input: CodingRequestInput,
): Promise<CodingRequestMessage> {
  return enqueueFromSource("github", queue, principal, input);
}

export function enqueueSystemCodingRequest(
  queue: CodingRequestQueue,
  principal: CodingProducerPrincipal & { source: "system" },
  input: CodingRequestInput,
): Promise<CodingRequestMessage> {
  return enqueueFromSource("system", queue, principal, input);
}
