# Research: Choose the default Codex-subscription title model

## Summary

Recommend the exact Pi pair **`openai-codex/gpt-5.4-mini`** as the default subscription-backed title model. It is the only compared candidate with credible current availability across both Go and Plus, it is cheaper in Codex quota/credits than `gpt-5.6-luna`, OpenAI positions it for fast responsive subagent work, and OpenAI documents `reasoning.effort: none`; however, Pi’s current simple `complete()` path turns its generic `off` setting into an omitted reasoning field, so the implementation must not claim that `none` is enforced until that request path is verified or changed.

`openai-codex/gpt-5.6-luna` is an excellent Plus-only alternative, but OpenAI explicitly says Go users receive GPT-5.6 Terra rather than Luna. `openai/gpt-5-nano` and `openai/gpt-5.4-nano` are API-key models, not substitutes available through Pi’s ChatGPT OAuth-backed `openai-codex` provider.

## Executive recommendation

Set the shipped default to:

```text
provider: openai-codex
model: gpt-5.4-mini
```

This recommendation establishes the default candidate; the representative prompt evaluation tracked in [Validate title quality with representative prompts](https://github.com/nistaux/pi-prompt-title/issues/7) must confirm short-title quality before release.

Do not fall back silently to `openai/gpt-5-nano` or `openai/gpt-5.4-nano`: doing so changes both the provider and authentication/billing boundary from a ChatGPT subscription to an API key. At runtime, still require `ModelRegistry.find("openai-codex", "gpt-5.4-mini")` and configured auth; if unavailable, leave the session untitled rather than sending the prompt through another provider.

## Findings

1. **Pi’s exact subscription-backed ID is `openai-codex/gpt-5.4-mini`.** Pi maintains a separate, explicit ChatGPT-OAuth Codex catalog rather than deriving it from API availability. The current generator creates `provider: "openai-codex"`, `id: "gpt-5.4-mini"`, API `openai-codex-responses`, and base URL `https://chatgpt.com/backend-api`; it separately includes `gpt-5.6-luna`. This is a different provider from API-key-backed `openai`. [Pi model generator at the researched revision](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/scripts/generate-models.ts)

2. **`gpt-5.4-mini` best matches broad lower-tier subscription access.** OpenAI’s launch states that GPT-5.4 mini is available in Codex across the app, CLI, IDE extension, and web, and the current official Codex plan material identifies it among the models included for Go. The current live Codex pricing page explicitly lists it for Plus at 60–350 local messages per five hours. OpenAI does not publish a similarly precise live Go per-model limit table, so Go access is supported by official plan/manual material but its exact quota remains unpublished and should be rechecked near release. [GPT-5.4 mini announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/) [Codex pricing](https://developers.openai.com/codex/pricing) [Codex manual](https://developers.openai.com/codex/codex-manual.md)

3. **`gpt-5.6-luna` does not meet the Go requirement.** OpenAI’s GPT-5.6 launch explicitly says Free and Go users access **Terra**, while Plus and higher plans can choose Sol, Terra, and Luna. Plus availability is also explicit in the current Codex pricing page, which lists Luna at 50–280 local messages per five hours. Therefore `openai-codex/gpt-5.6-luna` is a valid and attractive Plus candidate, but not a broad Go-and-Plus default. [GPT-5.6 announcement](https://openai.com/index/gpt-5-6/) [Codex pricing](https://developers.openai.com/codex/pricing)

4. **Mini consumes less subscription quota than Luna.** OpenAI’s token-based Codex rate card charges GPT-5.4 mini **18.75 input / 1.875 cached-input / 113 output credits per 1M tokens**, versus Luna’s **25 / 2.5 / 150**. Mini therefore consumes about **25% fewer credits** for input and cached input and about **24.7% fewer for output**. The older launch shorthand says Mini uses 30% of GPT-5.4 quota. The Plus local-message ranges point the same direction: 60–350 for Mini versus 50–280 for Luna. For a tiny title request, actual usage still depends on context, output, reasoning, and caching. [Codex rate card](https://help.openai.com/en/articles/20001106-codex-rate-card) [Codex pricing](https://developers.openai.com/codex/pricing) [GPT-5.4 mini announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/)

5. **Latency and quality evidence is adequate but indirect.** OpenAI says GPT-5.4 mini runs more than twice as fast as GPT-5 mini and is designed for latency-sensitive coding assistants and narrower subagent tasks. Its official Codex model card calls it a “fast, efficient mini model for responsive coding tasks and subagents.” OpenAI gives Luna the same four-of-five relative speed icons, calls it fast/affordable, and recommends it for extraction, classification, transformation, and structured summaries. No first-party source publishes a short-session-title benchmark; the recommendation rests on task fit, speed positioning, and ample general capability, not a direct title-quality test. [GPT-5.4 mini announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/) [Codex models](https://developers.openai.com/codex/models)

6. **OpenAI documents `none` for GPT-5.4 mini’s API, but subscription-path enforcement needs care.** The official model page says `reasoning.effort` supports `none` (default), low, medium, high, and xhigh. That page documents the OpenAI API and cannot alone prove identical behavior on ChatGPT OAuth. Codex-facing docs expose Light/Low as the lowest UI effort and do not explicitly promise a None control. Pi’s low-level `openai-codex-responses` options accept `"none"` and serialize it as `reasoning.effort`; however, Pi’s `streamSimple` path maps generic `reasoning: "off"` to `undefined`, omitting the reasoning object. Thus the title call should either use a verified provider-specific path that sends `none`, or treat “no reasoning” as an unresolved implementation requirement rather than assuming `complete(..., { reasoning: "off" })` enforces it. [GPT-5.4 mini API model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini) [Pi Codex response provider at the researched revision](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/src/api/openai-codex-responses.ts) [Codex models](https://developers.openai.com/codex/models)

7. **Luna’s `none` status is less clear in Codex docs.** Pi’s low-level Codex provider type can send `none` for any catalog model, and current Pi metadata recognizes GPT-5.6 models as supporting no-reasoning on the direct OpenAI Responses provider. But OpenAI’s Codex model-selection documentation lists Low through Max, and Luna’s API model card does not enumerate supported effort values in the fetched current text. This uncertainty is another reason not to prefer Luna for a strict no-reasoning title contract. [Pi Codex response provider](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/src/api/openai-codex-responses.ts) [Pi model generator](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/scripts/generate-models.ts) [GPT-5.6 Luna API model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

8. **The nano models are API-only for this decision.** OpenAI explicitly says GPT-5.4 nano is only available in the API, while Mini is available in API, Codex, and ChatGPT. Pi accordingly does not place either nano model in its explicit `openai-codex` list. Their exact Pi pairs are `openai/gpt-5-nano` and `openai/gpt-5.4-nano`, requiring OpenAI API auth and API billing. Their low API prices and strong task fit do not make them subscription-backed candidates. [GPT-5.4 mini/nano announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/) [GPT-5 nano API model page](https://developers.openai.com/api/docs/models/gpt-5-nano) [GPT-5.4 nano API model page](https://developers.openai.com/api/docs/models/gpt-5.4-nano) [Pi model generator](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/scripts/generate-models.ts)

## Candidate and plan comparison

| Exact Pi provider/model | Auth/billing surface | Go Codex subscription | Plus Codex subscription | No-reasoning evidence | Relative usage / latency | Decision |
|---|---|---|---|---|---|---|
| **`openai-codex/gpt-5.4-mini`** | ChatGPT OAuth / Codex allowance or credits | **Yes, with caveat:** official Codex availability/manual evidence; no current per-model Go quota table | **Yes:** 60–350 local messages/5h | API docs: `none` default; Pi low-level Codex path can send `none`; Pi simple path currently omits on `off` | 18.75/1.875/113 credits per 1M input/cached/output; OpenAI says >2× GPT-5-mini speed and responsive/subagent fit | **Default** |
| `openai-codex/gpt-5.6-luna` | ChatGPT OAuth / Codex allowance or credits | **No:** official launch says Go gets Terra | **Yes:** 50–280 local messages/5h | Pi low-level path can send `none`; Codex docs do not explicitly offer None and Luna API page does not enumerate effort values | 25/2.5/150 credits per 1M; fast, high-volume, structured-summary fit | Plus-only alternative |
| `openai/gpt-5.4-nano` | OpenAI API key / metered API billing | **No** | **No** | API docs: `none` default | $0.20/$1.25 per 1M API input/output; smallest GPT-5.4 tier | Exclude from subscription default |
| `openai/gpt-5-nano` | OpenAI API key / metered API billing | **No** | **No** | API reasoning model; not in Codex OAuth catalog | $0.05/$0.40 per 1M; “very fast,” suited to summarization/classification, but older | Exclude from subscription default |

## Implications for the existing configuration contract

- Keep the model as an exact pair: `provider = "openai-codex"`, `model = "gpt-5.4-mini"`. Do not normalize it to `openai/gpt-5.4-mini`, and do not treat an API model with the same slug as equivalent.
- Preserve runtime availability/auth checks. A catalog entry proves that the installed Pi version knows a model; it does not prove that every account, region, rollout cohort, or workspace policy can invoke it.
- Keep API nano models out of any automatic subscription fallback list. Switching from `openai-codex` to `openai` would require separate user consent/configuration because it changes credentials and billing.
- If the contract currently represents reasoning as generic Pi `"off"`, document that current `streamSimple`/`complete` behavior omits the field. A strict “no reasoning work” requirement needs a verified provider-specific `reasoningEffort: "none"` request or an upstream Pi fix/test. Do not silently map to `low`.
- Cap title output and send only the prompt/title instruction; no tools are needed. Lower context and output directly reduce the token-based subscription credit charge.

## Unresolved uncertainties

1. OpenAI does not currently publish a Go per-model message table comparable to Plus. Official material supports GPT-5.4 mini’s Go inclusion, but exact Go limits and rollout/account exceptions are not stated.
2. OpenAI’s API documentation explicitly supports `none` for GPT-5.4 mini, while Codex UI docs describe Light/Low as the minimum. The ChatGPT OAuth backend’s contractual support for explicit `none` is not clearly documented by OpenAI.
3. Current Pi’s low-level Codex adapter can serialize `none`, but the public simple completion seam turns `off` into omission. A small authenticated integration test on both Go and Plus is needed before promising strict no-reasoning behavior.
4. There is no primary-source short-title quality benchmark. A privacy-safe eval of representative prompts would validate title quality and first-token/total latency, but available evidence is sufficient to choose the default.
5. Model and plan availability changes quickly. Recheck the official Codex models/pricing pages and the Pi catalog at release time.

## Concise resolution-ready answer

**Choose `openai-codex/gpt-5.4-mini`.** It is the best lower-tier subscription default: available through Pi’s ChatGPT OAuth-backed Codex provider, supported across Go and Plus with stronger published Plus headroom and roughly 25% lower token-credit rates than Luna, fast enough for responsive subagent work, and capable enough for short structured summaries. Do **not** choose `openai-codex/gpt-5.6-luna` because Go receives GPT-5.6 Terra, not Luna. Do **not** substitute `openai/gpt-5-nano` or `openai/gpt-5.4-nano`; those are API-key models. Track explicit `reasoning.effort: none` as an implementation verification item because Pi’s generic simple `off` path currently omits the reasoning field.

## Sources

- Kept: [OpenAI Codex models](https://developers.openai.com/codex/models) — current Codex model IDs, surfaces, speed/capability positioning, and Codex reasoning controls.
- Kept: [OpenAI Codex pricing](https://developers.openai.com/codex/pricing) — current Plus model limits and token-credit rates.
- Kept: [OpenAI Codex rate card](https://help.openai.com/en/articles/20001106-codex-rate-card) — authoritative subscription credit rates.
- Kept: [GPT-5.4 mini and nano announcement](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/) — Codex/API distinction, quota multiplier, latency, positioning, and nano’s API-only status.
- Kept: [GPT-5.6 announcement](https://openai.com/index/gpt-5-6/) — explicit Go-versus-Plus availability and Luna positioning.
- Kept: OpenAI API model pages for [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano), [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano), and [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) — exact API-only facts, effort support where published, and API prices; not used to infer subscription availability.
- Kept: [Pi model generator](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/scripts/generate-models.ts) and [Pi Codex adapter](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/packages/ai/src/api/openai-codex-responses.ts) — exact provider/model IDs and actual reasoning request behavior at the researched Pi revision.
- Dropped: OpenAI community posts, third-party model comparisons, GitHub issue anecdotes, and SEO model catalogs — excluded because official product/model docs and Pi source answer the question directly.
