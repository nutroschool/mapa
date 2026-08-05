import { supabase } from "@/lib/supabase";

export type GoogleDriveConnectionState =
  | "checking"
  | "disconnected"
  | "connecting"
  | "connected"
  | "uploading"
  | "error";

export type GoogleDriveStatus = {
  connected: boolean;
  account?: {
    email: string;
    name: string | null;
  };
  folder?: {
    id: string;
    name: string;
    url: string;
  } | null;
};

export type GoogleDriveFile = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  web_view_link: string;
  uploaded_at: string;
};

type GoogleDrivePayload = {
  action: "start" | "status" | "create-upload-session" | "register-upload" | "disconnect";
  return_to?: string;
  content_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  file_id?: string;
};

export async function invokeGoogleDrive<T>(payload: GoogleDrivePayload): Promise<T> {
  if (!supabase) throw new Error("O Supabase ainda não está configurado.");

  const { data, error } = await supabase.functions.invoke("google-drive-integration", {
    body: payload,
  });

  if (error) {
    let message = "Não foi possível falar com a integração do Google Drive.";
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      const responsePayload = await context.clone().json().catch(() => null);
      if (responsePayload && typeof responsePayload.error === "string") message = responsePayload.error;
    }
    throw new Error(message);
  }

  if (data && typeof data.error === "string") throw new Error(data.error);
  return data as T;
}

function putVideo(uploadUrl: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<{ id: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type || "video/mp4");
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("O Google Drive não concluiu o envio do vídeo."));
        return;
      }
      try {
        const payload = JSON.parse(request.responseText || "{}") as { id?: unknown };
        const id = String(payload.id || "");
        if (!id) throw new Error("missing_file_id");
        onProgress(100);
        resolve({ id });
      } catch {
        reject(new Error("O Google Drive recebeu o vídeo, mas não confirmou o arquivo."));
      }
    });
    request.addEventListener("error", () => reject(new Error("A conexão caiu durante o envio do vídeo.")));
    request.addEventListener("abort", () => reject(new Error("O envio do vídeo foi cancelado.")));
    request.send(file);
  });
}

export async function uploadVideoToGoogleDrive(
  contentId: string,
  file: File,
  onProgress: (progress: number) => void,
) {
  const session = await invokeGoogleDrive<{ upload_url: string }>({
    action: "create-upload-session",
    content_id: contentId,
    file_name: file.name,
    mime_type: file.type || "video/mp4",
    file_size: file.size,
  });
  const uploaded = await putVideo(session.upload_url, file, onProgress);
  return invokeGoogleDrive<{ file: GoogleDriveFile }>({
    action: "register-upload",
    content_id: contentId,
    file_id: uploaded.id,
  });
}
