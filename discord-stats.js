export async function onRequest(context) {
  const SERVER_ID = "1503798969023729864";
  const BOT_TOKEN = context.env.DISCORD_BOT_TOKEN;

  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "BOT_TOKEN not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${SERVER_ID}?with_counts=true`,
      {
        headers: { Authorization: `Bot ${BOT_TOKEN}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({
      members: data.approximate_member_count || 0,
      online: data.approximate_presence_count || 0,
      name: data.name || "Vesper Hub"
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
