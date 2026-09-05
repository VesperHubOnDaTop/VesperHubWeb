// VesperHubx Worker — serves static assets + /api/* endpoints

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function handleLogin(request, env) {
  const CLIENT_ID = env.DISCORD_CLIENT_ID;
  const REDIRECT_URI = env.DISCORD_REDIRECT_URI;
  const SCOPE = "identify guilds.join";

  if (!CLIENT_ID || !REDIRECT_URI) {
    return jsonResponse({ error: "Missing Discord OAuth config" }, 500);
  }

  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${SCOPE}`;
  return Response.redirect(url, 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return jsonResponse({ error: "Missing code parameter" }, 400);
  }

  const CLIENT_ID = env.DISCORD_CLIENT_ID;
  const CLIENT_SECRET = env.DISCORD_CLIENT_SECRET;
  const REDIRECT_URI = env.DISCORD_REDIRECT_URI;
  const BOT_TOKEN = env.DISCORD_BOT_TOKEN;
  const GUILD_ID = env.DISCORD_GUILD_ID;

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !BOT_TOKEN || !GUILD_ID) {
    return jsonResponse({ error: "Missing environment variables" }, 500);
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
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleStats(env) {
  const SERVER_ID = "1503798969023729864";
  const BOT_TOKEN = env.DISCORD_BOT_TOKEN;

  if (!BOT_TOKEN) {
    return jsonResponse({ error: "BOT_TOKEN not set" }, 500);
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${SERVER_ID}?with_counts=true`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    const data = await response.json();

    return jsonResponse({
      members: data.approximate_member_count || 0,
      online: data.approximate_presence_count || 0,
      name: data.name || "Vesper Hub"
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleMessages(env) {
  const CHANNEL_IDS = [
    "1526119492370042951",
    "1526119523412082738",
    "1514457920161447956",
    "1514457946111868948",
    "1514457969280946277",
  ];

  const BOT_TOKEN = env.DISCORD_BOT_TOKEN;
  const MAX_MESSAGES = 5;

  if (!BOT_TOKEN) {
    return jsonResponse({ error: "Missing BOT_TOKEN" }, 500);
  }

  try {
    const results = await Promise.all(
      CHANNEL_IDS.map(async (channelId) => {
        const res = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=3`,
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
        if (!res.ok) throw new Error(`Channel ${channelId} error: ${res.status}`);
        return await res.json();
      })
    );

    const priority1Messages = results[0] || [];
    const priority2Messages = results[1] || [];
    const otherMessages = results.slice(2).flat();

    const sortedP1 = priority1Messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const sortedP2 = priority2Messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const sortedOthers = otherMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let combined = [];
    const usedIds = new Set();

    if (sortedP1.length > 0) {
      combined.push(sortedP1[0]);
      usedIds.add(sortedP1[0].id);
    }

    if (sortedP2.length > 0 && !usedIds.has(sortedP2[0].id)) {
      combined.push(sortedP2[0]);
      usedIds.add(sortedP2[0].id);
    }

    const allRemaining = [...sortedP1.slice(1), ...sortedP2.slice(1), ...sortedOthers]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    for (const msg of allRemaining) {
      if (combined.length >= MAX_MESSAGES) break;
      if (!usedIds.has(msg.id)) {
        combined.push(msg);
        usedIds.add(msg.id);
      }
    }

    const formatted = combined.map(msg => ({
      author: msg.author.global_name || msg.author.username,
      content: msg.content || "(embed or attachment)",
      timestamp: msg.timestamp
    }));

    return jsonResponse(formatted);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

async function serveStatic(request, env, ctx) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const assetUrl = new URL(pathname, url.origin).toString();
  const asset = await env.ASSETS.fetch(assetUrl);
  if (asset.status === 200) {
    return asset;
  }

  // fallback to index.html (SPA behavior)
  const fallbackUrl = new URL("/index.html", url.origin).toString();
  return env.ASSETS.fetch(fallbackUrl);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/discord-login" || url.pathname === "/api/discord-login/") {
      return handleLogin(request, env);
    }
    if (url.pathname === "/api/discord-callback" || url.pathname === "/api/discord-callback/") {
      return handleCallback(request, env);
    }
    if (url.pathname === "/api/discord-stats" || url.pathname === "/api/discord-stats/") {
      return handleStats(env);
    }
    if (url.pathname === "/api/discord-messages" || url.pathname === "/api/discord-messages/") {
      return handleMessages(env);
    }

    return serveStatic(request, env, ctx);
  }
};
