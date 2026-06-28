import { ForbiddenError, UnauthorizedError } from "@/lib/session";
import { ZodError } from "zod";

export function jsonError(error: unknown, status = 500) {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    return Response.json({ error: message || "Validation failed." }, { status });
  }
  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: "Unexpected error." }, { status });
}
