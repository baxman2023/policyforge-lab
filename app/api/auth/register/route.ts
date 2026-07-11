export async function POST() {
  return Response.json({ error: "Password registration has been retired. Continue with Google." }, { status: 410 });
}
