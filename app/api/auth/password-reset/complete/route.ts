export async function POST() {
  return Response.json({ error: "Password authentication has been retired. Continue with Google." }, { status: 410 });
}
