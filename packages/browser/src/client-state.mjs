// Repeated state and frame updates never steal focus or reopen a hidden viewer.
export function shouldRevealBrowser(policy, state, { selectedSession, expanded }) {
  const reveal = state.reveal;
  if (!reveal || selectedSession !== state.sessionId) return false;
  const previous = policy.get(state.sessionId);
  if (previous?.runId === reveal.runId) {
    if (!expanded) previous.suppressed = true;
    return false;
  }
  policy.set(state.sessionId, { runId: reveal.runId, suppressed: false });
  return true;
}
