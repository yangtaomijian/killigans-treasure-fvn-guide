// Display preflight for the frozen QB1 pipeline, not a new API/cost contract.
// Derived and cross-checked against the unchanged Host by check-question-limits.mjs.
export const QUESTION_MAX_UTF16 = 1200;
export const U_WIRE_MAX_BYTES = 6000;
export const U_FIXED_WIRE_BYTES = 4991;
const encoder = new TextEncoder();
export function questionLengths(question) {
  // The question is JSON inside messages[1].content, then JSON on the wire.
  // Subtract the six ASCII bytes enclosing an empty double-serialized string.
  const uWireBytes = U_FIXED_WIRE_BYTES + encoder.encode(JSON.stringify(JSON.stringify(question))).length - 6;
  const utf16 = question.length;
  const over = utf16 > QUESTION_MAX_UTF16 || uWireBytes > U_WIRE_MAX_BYTES;
  // Warn at 90% of either the raw limit or the available encoded question space.
  const near = !over && (utf16 >= QUESTION_MAX_UTF16 * .9 || uWireBytes - U_FIXED_WIRE_BYTES >= (U_WIRE_MAX_BYTES - U_FIXED_WIRE_BYTES) * .9);
  return {utf16,uWireBytes,over,near};
}
