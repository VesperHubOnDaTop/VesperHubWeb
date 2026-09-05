export async function onRequest(context) {
  const CLIENT_ID = context.env.DISCORD_CLIENT_ID;
  const REDIRECT_URI = context.env.DISCORD_REDIRECT_URI;
  const SCOPE = "identify guilds.join";

  if (!CLIENT_ID || !REDIRECT_URI) {
    return new Response(JSON.stringify({ error: "Missing Discord OAuth config" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${SCOPE}`;

  return Response.redirect(url, 302);
}
