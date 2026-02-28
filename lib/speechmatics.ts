// Speechmatics real-time STT client
// Owner: Timothé — this is a stub for integration

/**
 * Speechmatics configuration.
 * Timothé will implement the full WebSocket-based real-time STT here.
 */
export const SPEECHMATICS_CONFIG = {
    apiKey: process.env.SPEECHMATICS_API_KEY!,
    language: "en",
};

// TODO: Timothé — implement WebSocket STT stream
// - Stream audio chunks → accumulate transcript
// - Handle `final` vs `partial` transcript events
// - Return full transcript on silence detection
