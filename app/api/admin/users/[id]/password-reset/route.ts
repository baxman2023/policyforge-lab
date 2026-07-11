export async function POST() {
  return Response.json({ error: "Password authentication has been retired. Users sign in with Google." }, { status: 410 });
}
