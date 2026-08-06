const productionAppUrl = "https://mapa.nutroschool.com.br";

function errorRedirect() {
  const target = new URL("/", productionAppUrl);
  target.searchParams.set("view", "roteiros");
  target.searchParams.set("drive", "error");
  target.searchParams.set("reason", "callback_proxy");
  return Response.redirect(target, 302);
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return errorRedirect();

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL("/functions/v1/google-drive-integration/callback", supabaseUrl);
  incomingUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value));

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": "MAPA-Google-Drive-OAuth-Callback/1.0" },
    });
    const location = upstreamResponse.headers.get("location");
    if (location && upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: location,
          "Cache-Control": "no-store",
        },
      });
    }
    console.error("[google-drive-callback] unexpected upstream response", {
      status: upstreamResponse.status,
    });
  } catch (error) {
    console.error("[google-drive-callback] upstream request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return errorRedirect();
}
