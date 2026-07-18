import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import piPromptTitle, {
  createPiPromptTitleExtension,
  type PiPromptTitleCapabilities,
} from "../src/index.js";

function inaccessiblePiApi(): ExtensionAPI {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(`The no-op extension accessed pi.${String(property)}`);
      },
    },
  ) as ExtensionAPI;
}

describe("Pi Prompt Title extension seam", () => {
  it("loads through its default export without registering or mutating anything", async () => {
    expect(await piPromptTitle(inaccessiblePiApi())).toBeUndefined();
  });

  it("exposes the five issue-agreed capabilities to injected runtime behavior", async () => {
    const pi = { on: vi.fn() } as unknown as ExtensionAPI;
    const completeTitle = vi.fn();
    const schedule = vi.fn();
    const cancel = vi.fn();
    const readConfiguration = vi.fn();
    const publishDiagnostic = vi.fn();
    let received: PiPromptTitleCapabilities | undefined;

    const extension = createPiPromptTitleExtension({
      runtime(capabilities) {
        received = capabilities;
      },
      dependencies: {
        titleModel: { complete: completeTitle },
        timer: { schedule, cancel },
        configurationFiles: { read: readConfiguration },
        uiDiagnostics: { publish: publishDiagnostic },
      },
    });

    await extension(pi);

    expect(received).toEqual({
      lifecycle: pi,
      titleModel: { complete: completeTitle },
      timer: { schedule, cancel },
      configurationFiles: { read: readConfiguration },
      uiDiagnostics: { publish: publishDiagnostic },
    });
    expect(pi.on).not.toHaveBeenCalled();
    expect(completeTitle).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(readConfiguration).not.toHaveBeenCalled();
    expect(publishDiagnostic).not.toHaveBeenCalled();
  });

  it("keeps every injected boundary untouched when no runtime behavior is supplied", async () => {
    const on = vi.fn();
    const complete = vi.fn();
    const schedule = vi.fn();
    const cancel = vi.fn();
    const read = vi.fn();
    const publish = vi.fn();
    const extension = createPiPromptTitleExtension({
      dependencies: {
        titleModel: { complete },
        timer: { schedule, cancel },
        configurationFiles: { read },
        uiDiagnostics: { publish },
      },
    });

    await extension({ on } as unknown as ExtensionAPI);

    expect([on, complete, schedule, cancel, read, publish]).toSatisfy(
      (spies: ReturnType<typeof vi.fn>[]) => spies.every((spy) => spy.mock.calls.length === 0),
    );
  });

  it("types UI diagnostics against Pi's public extension context", () => {
    const diagnostic: PiPromptTitleCapabilities["uiDiagnostics"]["publish"] = (
      _ctx: ExtensionContext,
      _message: string | undefined,
    ) => undefined;

    expect(diagnostic).toBeTypeOf("function");
  });
});
