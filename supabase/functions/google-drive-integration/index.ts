import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.0";

type JsonRecord = Record<string, unknown>;

type GoogleDriveConnection = {
  user_id: string;
  google_user_id: string;
  google_email: string;
  google_name: string | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  granted_scopes: string[];
  token_expires_at: string | null;
  folder_id: string | null;
  folder_name: string;
};

const productionAppUrl = "https://mapa.nutroschool.com.br";
const googleAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const googleRevokeUrl = "https://oauth2.googleapis.com/revoke";
const googleUserInfoUrl = "https://openidconnect.googleapis.com/v1/userinfo";
const driveApiUrl = "https://www.googleapis.com/drive/v3";
const driveUploadApiUrl = "https://www.googleapis.com/upload/drive/v3";
const driveFolderName = "MAPA Conteúdos";
const allowedScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.file",
];

function corsHeaders(req?: Request) {
  const configuredOrigins = (Deno.env.get("MAPA_ALLOWED_ORIGINS") || Deno.env.get("MAPA_APP_URL") || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allowedOrigins = new Set([
    ...configuredOrigins,
    productionAppUrl,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const origin = req?.headers.get("Origin")?.replace(/\/$/, "") || "";
  const selectedOrigin = allowedOrigins.has(origin)
    ? origin
    : configuredOrigins[0] || productionAppUrl;

  return {
    "Access-Control-Allow-Origin": selectedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

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
  const raw = base64ToBytes(requireEnv("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY"));
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
    : "/?view=roteiros";
}

function appRedirect(path: string) {
  const appUrl = (Deno.env.get("MAPA_CANONICAL_APP_URL") || productionAppUrl).replace(/\/$/, "");
  return new URL(path, `${appUrl}/`).toString();
}

function callbackUrl() {
  return `${requireEnv("SUPABASE_URL")}/functions/v1/google-drive-integration/callback`;
}

function safeDiagnostic(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "unexpected_error");
  return message
    .replace(/([?&](?:code|access_token|refresh_token|client_secret)=)[^&\s]+/gi, "$1[redacted]")
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

async function googleJson(url: string, accessToken?: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    const detail = typeof payload.error === "string"
      ? payload.error
      : JSON.stringify(payload.error || payload).slice(0, 300);
    throw new Error(`google_api:${response.status}:${detail}`);
  }
  return payload;
}

async function exchangeAuthorizationCode(code: string) {
  const body = new URLSearchParams({
    client_id: requireEnv("GOOGLE_DRIVE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: callbackUrl(),
  });
  return googleJson(googleTokenUrl, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function loadConnection(userId: string) {
  const { data, error } = await adminClient()
    .from("google_drive_connections")
    .select("user_id,google_user_id,google_email,google_name,access_token_ciphertext,refresh_token_ciphertext,granted_scopes,token_expires_at,folder_id,folder_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as GoogleDriveConnection | null;
}

async function refreshAccessToken(connection: GoogleDriveConnection) {
  if (!connection.refresh_token_ciphertext) throw new Error("google_reconnect_required");
  const refreshToken = await decryptToken(connection.refresh_token_ciphertext);
  const body = new URLSearchParams({
    client_id: requireEnv("GOOGLE_DRIVE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const payload = await googleJson(googleTokenUrl, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const accessToken = String(payload.access_token || "");
  if (!accessToken) throw new Error("google_api:invalid_refresh_response");
  const expiresIn = Number(payload.expires_in || 3600);

  const { error } = await adminClient().from("google_drive_connections").update({
    access_token_ciphertext: await encryptToken(accessToken),
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }).eq("user_id", connection.user_id);
  if (error) throw error;
  return accessToken;
}

async function usableAccessToken(connection: GoogleDriveConnection) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return decryptToken(connection.access_token_ciphertext);
  return refreshAccessToken(connection);
}

async function ensureDriveFolder(connection: GoogleDriveConnection, accessToken: string) {
  if (connection.folder_id) return connection.folder_id;

  const query = [
    `name = '${driveFolderName.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");
  const listUrl = new URL(`${driveApiUrl}/files`);
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("fields", "files(id,name)");
  listUrl.searchParams.set("pageSize", "1");
  const listPayload = await googleJson(listUrl.toString(), accessToken);
  const files = Array.isArray(listPayload.files) ? listPayload.files as JsonRecord[] : [];
  let folderId = String(files[0]?.id || "");

  if (!folderId) {
    const folder = await googleJson(`${driveApiUrl}/files?fields=id,name`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: driveFolderName,
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { mapaManaged: "true" },
      }),
    });
    folderId = String(folder.id || "");
  }
  if (!folderId) throw new Error("google_api:missing_folder_id");

  const { error } = await adminClient().from("google_drive_connections").update({
    folder_id: folderId,
    folder_name: driveFolderName,
  }).eq("user_id", connection.user_id);
  if (error) throw error;
  return folderId;
}

async function handleStart(req: Request, body: JsonRecord) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Faça login novamente para conectar o Google Drive." }, 401, req);

  const clientId = requireEnv("GOOGLE_DRIVE_CLIENT_ID");
  requireEnv("GOOGLE_DRIVE_CLIENT_SECRET");
  requireEnv("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY");

  const state = randomHex();
  const stateHash = await sha256Hex(state);
  const redirectTo = safeRedirectPath(body.return_to);
  const admin = adminClient();

  await admin
    .from("google_drive_oauth_states")
    .delete()
    .eq("user_id", user.id)
    .lt("expires_at", new Date().toISOString());

  const { error } = await admin.from("google_drive_oauth_states").insert({
    state_hash: stateHash,
    user_id: user.id,
    redirect_to: redirectTo,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw error;

  const authorizationUrl = new URL(googleAuthorizeUrl);
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl());
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", allowedScopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("prompt", "consent select_account");

  return json({ authorization_url: authorizationUrl.toString() }, 200, req);
}

async function handleCallback(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (!state) return Response.redirect(appRedirect("/?drive=error&reason=missing_state"), 302);

  const stateHash = await sha256Hex(state);
  const admin = adminClient();
  const { data: oauthState, error: stateError } = await admin
    .from("google_drive_oauth_states")
    .select("user_id,redirect_to,expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (stateError || !oauthState || new Date(oauthState.expires_at).getTime() <= Date.now()) {
    return Response.redirect(appRedirect("/?drive=error&reason=invalid_state"), 302);
  }
  await admin.from("google_drive_oauth_states").delete().eq("state_hash", stateHash);

  if (oauthError || !code) {
    return Response.redirect(appRedirect("/?drive=cancelled"), 302);
  }

  const tokenPayload = await atStage("token_exchange", () => exchangeAuthorizationCode(code));
  const accessToken = String(tokenPayload.access_token || "");
  const refreshToken = String(tokenPayload.refresh_token || "");
  const expiresIn = Number(tokenPayload.expires_in || 3600);
  if (!accessToken) throw new Error("token_exchange:google_api:invalid_token_response");

  const profile = await atStage("profile_fetch", () => googleJson(googleUserInfoUrl, accessToken));
  const googleUserId = String(profile.sub || "");
  const googleEmail = String(profile.email || "");
  if (!googleUserId || !googleEmail) throw new Error("profile_fetch:google_api:missing_google_identity");

  const existingConnection = await loadConnection(oauthState.user_id);
  const refreshTokenCiphertext = refreshToken
    ? await encryptToken(refreshToken)
    : existingConnection?.refresh_token_ciphertext || null;
  if (!refreshTokenCiphertext) throw new Error("token_exchange:google_api:missing_refresh_token");

  await atStage("connection_save", async () => {
    const { error } = await admin.from("google_drive_connections").upsert({
      user_id: oauthState.user_id,
      google_user_id: googleUserId,
      google_email: googleEmail,
      google_name: profile.name ? String(profile.name) : null,
      access_token_ciphertext: await encryptToken(accessToken),
      refresh_token_ciphertext: refreshTokenCiphertext,
      granted_scopes: String(tokenPayload.scope || allowedScopes.join(" ")).split(/\s+/).filter(Boolean),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      folder_id: existingConnection?.folder_id || null,
      folder_name: existingConnection?.folder_name || driveFolderName,
    }, { onConflict: "user_id" });
    if (error) throw error;
  });

  const connection = await loadConnection(oauthState.user_id);
  if (!connection) throw new Error("connection_save:missing_connection");
  await atStage("folder_setup", () => ensureDriveFolder(connection, accessToken));

  const separator = oauthState.redirect_to.includes("?") ? "&" : "?";
  return Response.redirect(appRedirect(`${oauthState.redirect_to}${separator}drive=connected`), 302);
}

async function handleStatus(req: Request) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Sessão inválida." }, 401, req);
  const connection = await loadConnection(user.id);
  if (!connection) return json({ connected: false }, 200, req);

  return json({
    connected: true,
    account: {
      email: connection.google_email,
      name: connection.google_name,
    },
    folder: connection.folder_id
      ? {
          id: connection.folder_id,
          name: connection.folder_name,
          url: `https://drive.google.com/drive/folders/${encodeURIComponent(connection.folder_id)}`,
        }
      : null,
  }, 200, req);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handleCreateUploadSession(req: Request, body: JsonRecord) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Sessão inválida." }, 401, req);

  const contentId = String(body.content_id || "");
  const fileName = String(body.file_name || "").trim();
  const mimeType = String(body.mime_type || "");
  const fileSize = Number(body.file_size || 0);
  if (!validUuid(contentId)) return json({ error: "Conteúdo inválido." }, 400, req);
  if (!fileName || fileName.length > 240) return json({ error: "Nome do vídeo inválido." }, 400, req);
  if (!mimeType.startsWith("video/")) return json({ error: "Selecione um arquivo de vídeo." }, 400, req);
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return json({ error: "Tamanho do vídeo inválido." }, 400, req);

  const admin = adminClient();
  const { data: content, error: contentError } = await admin
    .from("content_items")
    .select("id,title")
    .eq("id", contentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (contentError) throw contentError;
  if (!content) return json({ error: "Conteúdo não encontrado." }, 404, req);

  const connection = await loadConnection(user.id);
  if (!connection) return json({ error: "Conecte seu Google Drive antes de enviar o vídeo.", code: "drive_not_connected" }, 409, req);
  const accessToken = await usableAccessToken(connection);
  const folderId = await ensureDriveFolder(connection, accessToken);

  const uploadUrl = new URL(`${driveUploadApiUrl}/files`);
  uploadUrl.searchParams.set("uploadType", "resumable");
  uploadUrl.searchParams.set("fields", "id,name,mimeType,size,webViewLink,parents");
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(fileSize),
    },
    body: JSON.stringify({
      name: fileName,
      mimeType,
      parents: [folderId],
      appProperties: {
        mapaContentId: contentId,
        mapaUserId: user.id,
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`upload_session:${response.status}:${detail.slice(0, 300)}`);
  }
  const resumableUrl = response.headers.get("Location");
  if (!resumableUrl) throw new Error("upload_session:missing_location");

  return json({ upload_url: resumableUrl }, 200, req);
}

async function handleRegisterUpload(req: Request, body: JsonRecord) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Sessão inválida." }, 401, req);

  const contentId = String(body.content_id || "");
  const fileId = String(body.file_id || "");
  if (!validUuid(contentId) || !fileId || fileId.length > 200) {
    return json({ error: "Dados do envio inválidos." }, 400, req);
  }

  const connection = await loadConnection(user.id);
  if (!connection) return json({ error: "Google Drive não conectado." }, 409, req);
  const accessToken = await usableAccessToken(connection);
  const folderId = await ensureDriveFolder(connection, accessToken);
  const fileUrl = new URL(`${driveApiUrl}/files/${encodeURIComponent(fileId)}`);
  fileUrl.searchParams.set("fields", "id,name,mimeType,size,webViewLink,trashed,parents");
  const file = await googleJson(fileUrl.toString(), accessToken);
  const parents = Array.isArray(file.parents) ? file.parents.map(String) : [];
  if (file.trashed === true || !parents.includes(folderId) || !String(file.mimeType || "").startsWith("video/")) {
    return json({ error: "O arquivo enviado não pertence à pasta segura do MAPA." }, 400, req);
  }

  const savedFile = {
    id: String(file.id || fileId),
    name: String(file.name || "Vídeo"),
    mime_type: String(file.mimeType || "video/*"),
    size: Number(file.size || 0),
    web_view_link: String(file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`),
    uploaded_at: new Date().toISOString(),
  };
  const { data: updated, error } = await adminClient()
    .from("content_items")
    .update({
      drive_file_id: savedFile.id,
      drive_file_name: savedFile.name,
      drive_web_view_link: savedFile.web_view_link,
      drive_mime_type: savedFile.mime_type,
      drive_file_size: savedFile.size,
      drive_uploaded_at: savedFile.uploaded_at,
    })
    .eq("id", contentId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) return json({ error: "Conteúdo não encontrado." }, 404, req);

  return json({ file: savedFile }, 200, req);
}

async function handleDisconnect(req: Request) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Sessão inválida." }, 401, req);
  const connection = await loadConnection(user.id);
  if (connection) {
    const token = connection.refresh_token_ciphertext
      ? await decryptToken(connection.refresh_token_ciphertext)
      : await decryptToken(connection.access_token_ciphertext);
    await fetch(googleRevokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => null);
  }
  const { error } = await adminClient()
    .from("google_drive_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ connected: false }, 200, req);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const route = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) || "";

  try {
    if (req.method === "GET" && route === "callback") return await handleCallback(req);
    if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, req);

    const body = await req.json().catch(() => ({})) as JsonRecord;
    switch (body.action) {
      case "start":
        return await handleStart(req, body);
      case "status":
        return await handleStatus(req);
      case "create-upload-session":
        return await handleCreateUploadSession(req, body);
      case "register-upload":
        return await handleRegisterUpload(req, body);
      case "disconnect":
        return await handleDisconnect(req);
      default:
        return json({ error: "Ação inválida." }, 400, req);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    console.error("google-drive-integration", safeDiagnostic(message));
    const missingEnv = message.startsWith("missing_env:");
    if (req.method === "GET" && route === "callback") {
      const callbackReason = ["token_exchange", "profile_fetch", "connection_save", "folder_setup"]
        .find((stage) => message.startsWith(`${stage}:`)) || "callback_failed";
      return Response.redirect(appRedirect(`/?view=roteiros&drive=error&reason=${callbackReason}`), 302);
    }
    if (message.includes("google_reconnect_required") || message.includes("invalid_grant")) {
      return json({ error: "A autorização do Google Drive expirou. Conecte sua conta novamente.", code: "drive_reconnect_required" }, 401, req);
    }
    return json({
      error: missingEnv
        ? "A integração com o Google Drive ainda está sendo configurada."
        : "Não foi possível concluir a operação no Google Drive.",
      code: missingEnv ? "google_drive_not_configured" : "google_drive_integration_failed",
    }, missingEnv ? 503 : 500, req);
  }
});
