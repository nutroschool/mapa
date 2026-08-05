import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.0";

type JsonRecord = Record<string, unknown>;

type ConnectionRow = {
  user_id: string;
  instagram_user_id: string;
  username: string;
  account_type: string | null;
  profile_picture_url: string | null;
  access_token_ciphertext: string;
  granted_scopes: string[];
  token_expires_at: string | null;
  last_synced_at: string | null;
};

const graphVersion = Deno.env.get("INSTAGRAM_GRAPH_VERSION") || "v23.0";
const graphBaseUrl = "https://graph.instagram.com";
const instagramAuthorizeUrl = "https://www.instagram.com/oauth/authorize";
const instagramTokenUrl = "https://api.instagram.com/oauth/access_token";
const allowedScopes = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
];

function json(body: JsonRecord, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function corsHeaders(req?: Request) {
  const configuredOrigins = (Deno.env.get("MAPA_ALLOWED_ORIGINS") || Deno.env.get("MAPA_APP_URL") || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allowedOrigins = new Set([
    ...configuredOrigins,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const origin = req?.headers.get("Origin")?.replace(/\/$/, "") || "";
  const selectedOrigin = allowedOrigins.has(origin)
    ? origin
    : configuredOrigins[0] || "http://localhost:3000";

  return {
    "Access-Control-Allow-Origin": selectedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function adminClient() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const secretKey = secretKeys
    ? JSON.parse(secretKeys).default
    : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!secretKey) throw new Error("missing_env:SUPABASE_SECRET_KEYS");
  return createClient(requireEnv("SUPABASE_URL"), secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomHex(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey() {
  const raw = base64ToBytes(requireEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) throw new Error("invalid_encryption_key");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decryptToken(value: string) {
  const [ivValue, ciphertextValue] = value.split(".");
  if (!ivValue || !ciphertextValue) throw new Error("invalid_token_ciphertext");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    await encryptionKey(),
    base64ToBytes(ciphertextValue),
  );
  return new TextDecoder().decode(plaintext);
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await adminClient().auth.getUser(accessToken);
  return error ? null : user;
}

function safeRedirectPath(value: unknown) {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && value.length <= 500
    ? value
    : "/?view=desempenho";
}

function appRedirect(path: string) {
  const appUrl = requireEnv("MAPA_APP_URL").replace(/\/$/, "");
  return new URL(path, `${appUrl}/`).toString();
}

function callbackUrl() {
  return `${requireEnv("SUPABASE_URL")}/functions/v1/instagram-integration/callback`;
}

function functionUrl(path: string) {
  return `${requireEnv("SUPABASE_URL")}/functions/v1/instagram-integration${path}`;
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function readMetaSignedRequest(req: Request) {
  const contentType = req.headers.get("Content-Type") || "";
  let signedRequest = "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({})) as JsonRecord;
    signedRequest = typeof body.signed_request === "string" ? body.signed_request : "";
  } else {
    const form = new URLSearchParams(await req.text());
    signedRequest = form.get("signed_request") || "";
  }

  const [encodedSignature, encodedPayload] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload) throw new Error("invalid_signed_request");

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireEnv("META_INSTAGRAM_APP_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedSignature = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(encodedPayload)),
  );
  const providedSignature = base64UrlToBytes(encodedSignature);
  if (!constantTimeEqual(expectedSignature, providedSignature)) {
    throw new Error("invalid_signed_request_signature");
  }

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
  ) as JsonRecord;
  if (String(payload.algorithm || "").toUpperCase() !== "HMAC-SHA256") {
    throw new Error("invalid_signed_request_algorithm");
  }
  const instagramUserId = String(payload.user_id || "");
  if (!/^\d{1,64}$/.test(instagramUserId)) throw new Error("invalid_instagram_user_id");
  return { instagramUserId };
}

function textPage(title: string, paragraphs: string[], status = 200) {
  return new Response([title, ...paragraphs].join("\n\n"), {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function handlePrivacyPage() {
  return textPage("Política de Privacidade do MAPA", [
    "O MAPA acessa apenas os dados que o usuário autoriza em sua conta profissional do Instagram: identificação da conta, nome de usuário, informações públicas do perfil, conteúdos publicados e métricas de desempenho.",
    "Esses dados são usados somente para exibir análises de conteúdo ao próprio usuário. O token de acesso é criptografado no servidor, não é mostrado no navegador e não é vendido nem compartilhado para publicidade.",
    "O usuário pode desconectar o Instagram dentro do MAPA a qualquer momento. Também pode solicitar a exclusão pela Meta; a conexão, o token e os dados associados são removidos do MAPA.",
    "Dúvidas sobre privacidade: nutroschool@gmail.com.",
  ]);
}

function handleTermsPage() {
  return textPage("Termos de Uso do MAPA", [
    "O MAPA é uma ferramenta de organização e análise de conteúdo. O usuário continua responsável pela conta do Instagram, pelos conteúdos publicados e pelo cumprimento das regras da Meta.",
    "As métricas dependem da disponibilidade e das limitações da API oficial do Instagram. O serviço pode sofrer alterações ou indisponibilidades quando a Meta modificar suas APIs.",
    "O acesso à integração pode ser revogado pelo usuário a qualquer momento, sem transferir a propriedade da conta ou do conteúdo ao MAPA.",
  ]);
}

async function handleDeauthorize(req: Request) {
  const { instagramUserId } = await readMetaSignedRequest(req);
  const { error } = await adminClient()
    .from("instagram_connections")
    .delete()
    .eq("instagram_user_id", instagramUserId);
  if (error) throw error;
  return json({ success: true }, 200, req);
}

async function handleDataDeletion(req: Request) {
  const { instagramUserId } = await readMetaSignedRequest(req);
  const admin = adminClient();
  const { error: deleteError } = await admin
    .from("instagram_connections")
    .delete()
    .eq("instagram_user_id", instagramUserId);
  if (deleteError) throw deleteError;

  const confirmationCode = randomHex(16);
  const { error: requestError } = await admin.from("instagram_data_deletion_requests").insert({
    confirmation_code: confirmationCode,
    instagram_user_id_hash: await sha256Hex(instagramUserId),
    status: "completed",
    completed_at: new Date().toISOString(),
  });
  if (requestError) throw requestError;

  const statusUrl = new URL(functionUrl("/data-deletion-status"));
  statusUrl.searchParams.set("code", confirmationCode);
  return json({
    url: statusUrl.toString(),
    confirmation_code: confirmationCode,
  }, 200, req);
}

async function handleDataDeletionStatus(req: Request) {
  const code = new URL(req.url).searchParams.get("code") || "";
  if (!/^[a-f0-9]{32}$/.test(code)) {
    return textPage("Solicitação de exclusão não encontrada", [
      "O código informado é inválido. Solicite novamente a exclusão pelo Instagram.",
    ], 404);
  }
  const { data, error } = await adminClient()
    .from("instagram_data_deletion_requests")
    .select("status,completed_at")
    .eq("confirmation_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return textPage("Solicitação de exclusão não encontrada", [
      "Não encontramos uma solicitação de exclusão com esse código.",
    ], 404);
  }
  const completedAt = new Date(data.completed_at).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  return textPage("Dados excluídos do MAPA", [
    `A conexão com o Instagram e os dados associados foram removidos do MAPA em ${completedAt}.`,
    `Código de confirmação: ${code}.`,
  ]);
}

async function metaJson(url: string, accessToken?: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error_message || "Instagram API request failed";
    throw new Error(`meta_api:${response.status}:${message}`);
  }
  return payload;
}

function safeDiagnostic(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "unexpected_error");
  return message
    .replace(/([?&](?:code|access_token|client_secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 600);
}

async function atStage<T>(stage: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw new Error(`${stage}:${safeDiagnostic(error)}`);
  }
}

async function handleStart(req: Request, body: JsonRecord) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Faça login novamente para conectar o Instagram." }, 401, req);

  const appId = requireEnv("META_INSTAGRAM_APP_ID");
  requireEnv("META_INSTAGRAM_APP_SECRET");
  requireEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY");

  const state = randomHex();
  const stateHash = await sha256Hex(state);
  const redirectTo = safeRedirectPath(body.return_to);
  const admin = adminClient();

  await admin
    .from("instagram_oauth_states")
    .delete()
    .eq("user_id", user.id)
    .lt("expires_at", new Date().toISOString());

  const { error } = await admin.from("instagram_oauth_states").insert({
    state_hash: stateHash,
    user_id: user.id,
    redirect_to: redirectTo,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw error;

  const authorizationUrl = new URL(instagramAuthorizeUrl);
  authorizationUrl.searchParams.set("client_id", appId);
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl());
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", allowedScopes.join(","));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("force_reauth", "true");

  return json({ authorization_url: authorizationUrl.toString() }, 200, req);
}

async function handleCallback(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (!state) {
    return Response.redirect(appRedirect("/?instagram=error&reason=missing_state"), 302);
  }

  const stateHash = await sha256Hex(state);
  const admin = adminClient();
  const { data: oauthState, error: stateError } = await admin
    .from("instagram_oauth_states")
    .select("user_id,redirect_to,expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (stateError || !oauthState || new Date(oauthState.expires_at).getTime() <= Date.now()) {
    return Response.redirect(appRedirect("/?instagram=error&reason=invalid_state"), 302);
  }

  await admin.from("instagram_oauth_states").delete().eq("state_hash", stateHash);

  if (oauthError || !code) {
    return Response.redirect(appRedirect("/?instagram=cancelled"), 302);
  }

  const tokenForm = new URLSearchParams({
    client_id: requireEnv("META_INSTAGRAM_APP_ID"),
    client_secret: requireEnv("META_INSTAGRAM_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: callbackUrl(),
    code,
  });
  const shortToken = await atStage("token_exchange", () => metaJson(instagramTokenUrl, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm,
  }));
  const shortAccessToken = String(shortToken.access_token || "");
  const instagramUserId = String(shortToken.user_id || "");
  if (!shortAccessToken || !instagramUserId) throw new Error("meta_api:invalid_token_response");

  const longTokenUrl = new URL(`${graphBaseUrl}/access_token`);
  longTokenUrl.searchParams.set("grant_type", "ig_exchange_token");
  longTokenUrl.searchParams.set("client_secret", requireEnv("META_INSTAGRAM_APP_SECRET"));
  longTokenUrl.searchParams.set("access_token", shortAccessToken);
  const longToken = await atStage("long_token_exchange", () => metaJson(longTokenUrl.toString()));
  const accessToken = String(longToken.access_token || shortAccessToken);
  const expiresIn = Number(longToken.expires_in || 3600);

  const profileUrl = new URL(`${graphBaseUrl}/${graphVersion}/${instagramUserId}`);
  profileUrl.searchParams.set(
    "fields",
    "id,user_id,username,account_type,profile_picture_url,followers_count,media_count",
  );
  const profile = await atStage("profile_fetch", () => metaJson(profileUrl.toString(), accessToken));

  await atStage("connection_save", async () => {
    const { error: connectionError } = await admin.from("instagram_connections").upsert({
      user_id: oauthState.user_id,
      instagram_user_id: instagramUserId,
      username: String(profile.username || "Instagram"),
      account_type: profile.account_type ? String(profile.account_type) : null,
      profile_picture_url: profile.profile_picture_url ? String(profile.profile_picture_url) : null,
      access_token_ciphertext: await encryptToken(accessToken),
      granted_scopes: allowedScopes,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (connectionError) throw connectionError;
  });

  const separator = oauthState.redirect_to.includes("?") ? "&" : "?";
  return Response.redirect(
    appRedirect(`${oauthState.redirect_to}${separator}instagram=connected`),
    302,
  );
}

async function loadConnection(userId: string) {
  const { data, error } = await adminClient()
    .from("instagram_connections")
    .select("user_id,instagram_user_id,username,account_type,profile_picture_url,access_token_ciphertext,granted_scopes,token_expires_at,last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ConnectionRow | null;
}

async function handleStatus(req: Request) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Sessão inválida." }, 401, req);
  const connection = await loadConnection(user.id);
  if (!connection) return json({ connected: false }, 200, req);
  return json({
    connected: true,
    account: {
      username: connection.username,
      account_type: connection.account_type,
      profile_picture_url: connection.profile_picture_url,
    },
    token_expires_at: connection.token_expires_at,
    last_synced_at: connection.last_synced_at,
  }, 200, req);
}

async function maybeRefreshToken(connection: ConnectionRow, accessToken: string) {
  if (!connection.token_expires_at) return accessToken;
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > 7 * 24 * 60 * 60 * 1000) return accessToken;

  const refreshUrl = new URL(`${graphBaseUrl}/refresh_access_token`);
  refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
  refreshUrl.searchParams.set("access_token", accessToken);

  try {
    const refreshed = await metaJson(refreshUrl.toString());
    const refreshedToken = String(refreshed.access_token || accessToken);
    const expiresIn = Number(refreshed.expires_in || 60 * 24 * 60 * 60);
    await adminClient().from("instagram_connections").update({
      access_token_ciphertext: await encryptToken(refreshedToken),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }).eq("user_id", connection.user_id);
    return refreshedToken;
  } catch {
    return accessToken;
  }
}

function metricValue(metric: JsonRecord) {
  const totalValue = metric.total_value as JsonRecord | undefined;
  if (typeof totalValue?.value === "number") return totalValue.value;
  const values = Array.isArray(metric.values) ? metric.values : [];
  return values.reduce((sum, item) => {
    const value = (item as JsonRecord)?.value;
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

async function fetchInsightMetric(mediaId: string, metric: string, accessToken: string) {
  const url = new URL(`${graphBaseUrl}/${graphVersion}/${mediaId}/insights`);
  url.searchParams.set("metric", metric);
  try {
    const payload = await metaJson(url.toString(), accessToken);
    const item = Array.isArray(payload.data) ? payload.data[0] as JsonRecord | undefined : undefined;
    return item ? metricValue(item) : 0;
  } catch {
    return 0;
  }
}

async function enrichMedia(media: JsonRecord, accessToken: string) {
  const id = String(media.id || "");
  const metricNames = ["views", "reach", "total_interactions", "shares", "saved"];
  const values = await Promise.all(
    metricNames.map((metric) => fetchInsightMetric(id, metric, accessToken)),
  );
  const insights = Object.fromEntries(metricNames.map((metric, index) => [metric, values[index]]));
  const likes = Number(media.like_count || 0);
  const comments = Number(media.comments_count || 0);
  const interactions = Number(insights.total_interactions || 0)
    || likes + comments + Number(insights.shares || 0) + Number(insights.saved || 0);

  return {
    id,
    caption: String(media.caption || "Conteúdo sem legenda"),
    media_type: String(media.media_type || media.media_product_type || "MEDIA"),
    permalink: String(media.permalink || ""),
    timestamp: String(media.timestamp || ""),
    thumbnail_url: String(media.thumbnail_url || ""),
    likes,
    comments,
    views: Number(insights.views || 0),
    reach: Number(insights.reach || 0),
    shares: Number(insights.shares || 0),
    saved: Number(insights.saved || 0),
    interactions,
  };
}

async function handleMetrics(req: Request, body: JsonRecord) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Sessão inválida." }, 401, req);
  const connection = await loadConnection(user.id);
  if (!connection) return json({ error: "Instagram ainda não conectado." }, 404, req);
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) {
    return json({ error: "A autorização do Instagram expirou. Conecte novamente." }, 401, req);
  }

  const periodDays = Number(body.period_days) === 90 ? 90 : 30;
  const threshold = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  let accessToken = await decryptToken(connection.access_token_ciphertext);
  accessToken = await maybeRefreshToken(connection, accessToken);

  const profileUrl = new URL(`${graphBaseUrl}/${graphVersion}/${connection.instagram_user_id}`);
  profileUrl.searchParams.set(
    "fields",
    "id,user_id,username,account_type,profile_picture_url,followers_count,media_count",
  );
  const mediaUrl = new URL(`${graphBaseUrl}/${graphVersion}/${connection.instagram_user_id}/media`);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,like_count,comments_count",
  );
  mediaUrl.searchParams.set("limit", "50");

  const [profile, mediaPayload] = await Promise.all([
    metaJson(profileUrl.toString(), accessToken),
    metaJson(mediaUrl.toString(), accessToken),
  ]);
  const recentMedia = (Array.isArray(mediaPayload.data) ? mediaPayload.data : [])
    .filter((item: JsonRecord) => new Date(String(item.timestamp || 0)).getTime() >= threshold)
    .slice(0, 12);

  const media = [];
  for (let index = 0; index < recentMedia.length; index += 3) {
    const batch = recentMedia.slice(index, index + 3);
    media.push(...await Promise.all(batch.map((item: JsonRecord) => enrichMedia(item, accessToken))));
  }
  media.sort((a, b) => b.views - a.views);

  const summary = media.reduce(
    (totals, item) => ({
      views: totals.views + item.views,
      reach: totals.reach + item.reach,
      interactions: totals.interactions + item.interactions,
    }),
    { views: 0, reach: 0, interactions: 0 },
  );
  const syncedAt = new Date().toISOString();
  await adminClient().from("instagram_connections").update({
    username: String(profile.username || connection.username),
    account_type: profile.account_type ? String(profile.account_type) : connection.account_type,
    profile_picture_url: profile.profile_picture_url
      ? String(profile.profile_picture_url)
      : connection.profile_picture_url,
    last_synced_at: syncedAt,
  }).eq("user_id", user.id);

  return json({
    connected: true,
    period_days: periodDays,
    synced_at: syncedAt,
    account: {
      username: String(profile.username || connection.username),
      account_type: profile.account_type ? String(profile.account_type) : connection.account_type,
      profile_picture_url: profile.profile_picture_url
        ? String(profile.profile_picture_url)
        : connection.profile_picture_url,
      followers: Number(profile.followers_count || 0),
      media_count: Number(profile.media_count || 0),
    },
    summary: {
      ...summary,
      engagement: summary.reach > 0
        ? Number(((summary.interactions / summary.reach) * 100).toFixed(2))
        : 0,
    },
    media,
  }, 200, req);
}

async function handleDisconnect(req: Request) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Sessão inválida." }, 401, req);
  const { error } = await adminClient()
    .from("instagram_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ connected: false }, 200, req);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const route = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) || "";

  try {

    if (req.method === "GET" && route === "privacy") return handlePrivacyPage();
    if (req.method === "GET" && route === "terms") return handleTermsPage();
    if (req.method === "GET" && route === "data-deletion-status") {
      return await handleDataDeletionStatus(req);
    }
    if (req.method === "GET") return await handleCallback(req);
    if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, req);

    if (route === "deauthorize") return await handleDeauthorize(req);
    if (route === "data-deletion") return await handleDataDeletion(req);

    const body = await req.json().catch(() => ({})) as JsonRecord;
    switch (body.action) {
      case "start":
        return await handleStart(req, body);
      case "status":
        return await handleStatus(req);
      case "metrics":
        return await handleMetrics(req, body);
      case "disconnect":
        return await handleDisconnect(req);
      default:
        return json({ error: "Ação inválida." }, 400, req);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    const missingEnv = message.startsWith("missing_env:");
    console.error("instagram-integration", safeDiagnostic(message));
    if (req.method === "GET" && route === "callback") {
      return Response.redirect(appRedirect("/?view=desempenho&instagram=error&reason=callback_failed"), 302);
    }
    return json({
      error: missingEnv
        ? "A integração está pronta no MAPA, mas falta concluir a configuração do aplicativo na Meta."
        : "Não foi possível concluir a integração com o Instagram.",
      code: missingEnv ? "instagram_not_configured" : "instagram_integration_failed",
    }, missingEnv ? 503 : 500, req);
  }
});
