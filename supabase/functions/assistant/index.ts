/**
 * assistant — placeholder.
 *
 * Returns 501 with a clear, machine-readable reason. It exists now so the
 * client can wire and test the "assistant unavailable offline" path against a
 * real endpoint rather than a mock, and so nobody accidentally points the app at
 * a half-built assistant.
 *
 * Implemented in M10. When it is, the rules it must keep are:
 *   - Gemini is called HERE and nowhere else, never from the browser.
 *   - Phone numbers, shelter coordinates and medical instructions are served
 *     from deterministic data, never from model output.
 *   - Grounded in the content pack + snapshot, and answers carry source chips.
 */
import { corsHeaders, handleOptions, jsonError } from '../_shared/http.ts'

Deno.serve((req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const headers = corsHeaders(req.headers.get('origin'))

  const response = jsonError(
    'not_implemented',
    'The assistant is not implemented yet. It ships in M10.',
    {
      // Enough for the client to pick the right fallback without string matching.
      planned: 'M10',
      fallback: 'offline-kb',
      // The client should use these rather than the LLM for safety facts.
      deterministicSources: ['contacts.json', 'kb/<locale>.json', 'places.json'],
    },
  )

  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
})
