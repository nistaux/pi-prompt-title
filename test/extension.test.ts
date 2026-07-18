import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import piPromptTitle, {
  createPiPromptTitleExtension,
  type PiPromptTitleCapabilities,
} from "../src/index.js";

describe("Pi Prompt Title extension seam", () => {
  it("loads through its default export with only the configuration session hook", async () => {
    const on = vi.fn();

    expect(await piPromptTitle({ on } as unknown as ExtensionAPI)).toBeUndefined();

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
  });

  it("preserves the issue-agreed capabilities and exposes session snapshots to runtime behavior", async () => {
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

    expect(received).toMatchObject({
      lifecycle: pi,
      titleModel: { complete: completeTitle },
      timer: { schedule, cancel },
      configurationFiles: { read: readConfiguration },
      uiDiagnostics: { publish: publishDiagnostic },
      sessionConfiguration: { subscribe: expect.any(Function) },
    });
    expect(pi.on).toHaveBeenCalledTimes(1);
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(completeTitle).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(readConfiguration).not.toHaveBeenCalled();
    expect(publishDiagnostic).not.toHaveBeenCalled();
  });

  it("keeps injected effect boundaries untouched until a session starts", async () => {
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

    expect(on).toHaveBeenCalledTimes(1);
    expect([complete, schedule, cancel, read, publish]).toSatisfy(
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
