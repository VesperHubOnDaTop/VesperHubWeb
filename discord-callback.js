export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response(JSON.stringify({ error: "Missing code parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const CLIENT_ID = context.env.DISCORD_CLIENT_ID;
  const CLIENT_SECRET = context.env.DISCORD_CLIENT_SECRET;
  const REDIRECT_URI = context.env.DISCORD_REDIRECT_URI;
  const BOT_TOKEN = context.env.DISCORD_BOT_TOKEN;
  const GUILD_ID = context.env.DISCORD_GUILD_ID;

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !BOT_TOKEN || !GUILD_ID) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userRes.ok) throw new Error("Failed to fetch user");
    const userData = await userRes.json();

    const joinRes = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ access_token: accessToken })
      }
    );

    let joinStatus = "already_member";
    if (joinRes.status === 201) {
      joinStatus = "joined";
    } else if (joinRes.status === 204) {
      joinStatus = "already_member";
    } else {
      joinStatus = "failed";
    }

    const sessionData = {
      user: {
        id: userData.id,
        username: userData.username,
        global_name: userData.global_name || userData.username,
        avatar: userData.avatar
      },
      joinStatus: joinStatus,
      accessToken: accessToken
    };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Redirecting...</title>
          <script>
            const data = ${JSON.stringify(sessionData)};
            window.location.href = '/#session=' + encodeURIComponent(JSON.stringify(data));
          </script>
        </head>
        <body>Redirecting...</body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
