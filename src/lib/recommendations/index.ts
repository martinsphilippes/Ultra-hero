// Ponto de entrada do motor de recomendações (sem o módulo server-only de persistência).
export * from "./types";
export { deterministicEngine, rankDeterministic, scoreCandidate, diversify } from "./deterministic";
export { openAiEngine, hasOpenAiKey } from "./providers/openai";
export { geminiEngine, hasGeminiKey } from "./providers/gemini";
export { loadCandidates, loadExcludedContentIds } from "./candidates";
export { loadSignals, visitorSignals } from "./signals";
export { decideEngine, readPublicAiSettings } from "./guardrails";
export { parseReason, serializeReason } from "./reasons";
