/**
 * Minimal stand-in for Next's NextResponse so API handlers are plain Web-standard
 * `(Request) => Response` functions that run unchanged inside Next.js OR the standalone backend.
 */
export const NextResponse = {
  json(body: unknown, init?: ResponseInit): Response {
    return Response.json(body, init);
  },
};
