import { supabase } from "@/lib/supabase";

export type CaptureKind = "audio" | "link" | "image" | "text" | "pdf";

export type CaptureItem = {
  id: string;
  workspaceId: string;
  kind: CaptureKind;
  title: string;
  text: string;
  url: string;
  tags: string[];
  createdAt: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  storagePath: string | null;
  blob: Blob | null;
};

export type NewCaptureItem = Omit<CaptureItem, "id" | "createdAt" | "storagePath">;

const databaseName = "mapa-capture-inbox-v1";
const storeName = "captures";
const captureBucket = "capture-inbox";

type CaptureRow = {
  id: string;
  user_id: string;
  kind: CaptureKind;
  title: string;
  body_text: string;
  source_url: string;
  tags: string[];
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  created_at: string;
};

function usesCloud(workspaceId: string) {
  return Boolean(supabase && workspaceId !== "local");
}

function rowToCapture(row: CaptureRow): CaptureItem {
  return {
    id: row.id,
    workspaceId: row.user_id,
    kind: row.kind,
    title: row.title,
    text: row.body_text,
    url: row.source_url,
    tags: row.tags || [],
    createdAt: row.created_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    blob: null,
  };
}

function safeFileName(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return safe.slice(0, 110) || "arquivo";
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("O armazenamento local de arquivos não está disponível neste navegador."));
      return;
    }

    const request = indexedDB.open(databaseName, 1);
    request.onerror = () => reject(request.error || new Error("Não foi possível abrir o Inbox local."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(storeName)) return;
      const store = database.createObjectStore(storeName, { keyPath: "id" });
      store.createIndex("workspaceId", "workspaceId", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Não foi possível concluir a operação local."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Não foi possível salvar no Inbox local."));
    };
  }));
}

async function listLocalCaptures(workspaceId: string) {
  const database = await openDatabase();
  return new Promise<CaptureItem[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const index = transaction.objectStore(storeName).index("workspaceId");
    const request = index.getAll(IDBKeyRange.only(workspaceId));
    request.onsuccess = () => {
      const captures = (request.result as CaptureItem[])
        .map((capture) => ({ ...capture, storagePath: capture.storagePath || null }))
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
      resolve(captures);
    };
    request.onerror = () => reject(request.error || new Error("Não foi possível carregar suas inspirações."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Não foi possível acessar o Inbox local."));
    };
  });
}

async function saveCloudCapture(capture: CaptureItem, migrating = false) {
  if (!supabase) throw new Error("A sincronização do Inbox não está disponível.");
  let storagePath: string | null = null;
  if (capture.blob && capture.fileName) {
    storagePath = `${capture.workspaceId}/${capture.id}/${safeFileName(capture.fileName)}`;
    const { error: uploadError } = await supabase.storage
      .from(captureBucket)
      .upload(storagePath, capture.blob, {
        contentType: capture.mimeType || undefined,
        upsert: migrating,
      });
    if (uploadError) throw new Error("Não foi possível enviar o arquivo da captura.");
  }

  const values = {
    id: capture.id,
    user_id: capture.workspaceId,
    kind: capture.kind,
    title: capture.title,
    body_text: capture.text,
    source_url: capture.url,
    tags: capture.tags,
    file_name: capture.fileName,
    mime_type: capture.mimeType,
    file_size: capture.fileSize,
    storage_path: storagePath,
    created_at: capture.createdAt,
  };
  const query = migrating
    ? supabase.from("capture_items").upsert(values, { onConflict: "id" })
    : supabase.from("capture_items").insert(values);
  const { data, error } = await query
    .select("id,user_id,kind,title,body_text,source_url,tags,file_name,mime_type,file_size,storage_path,created_at")
    .single();

  if (error || !data) {
    if (storagePath) await supabase.storage.from(captureBucket).remove([storagePath]);
    throw new Error("Não foi possível salvar a captura sincronizada.");
  }
  return rowToCapture(data as CaptureRow);
}

export async function listCaptures(workspaceId: string) {
  if (usesCloud(workspaceId) && supabase) {
    const { data, error } = await supabase
      .from("capture_items")
      .select("id,user_id,kind,title,body_text,source_url,tags,file_name,mime_type,file_size,storage_path,created_at")
      .eq("user_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar suas inspirações sincronizadas.");
    const cloudCaptures = (data as CaptureRow[]).map(rowToCapture);
    const cloudIds = new Set(cloudCaptures.map((capture) => capture.id));
    const localCaptures = await listLocalCaptures(workspaceId).catch(() => []);
    const migratedCaptures: CaptureItem[] = [];
    const pendingLocalCaptures: CaptureItem[] = [];

    for (const localCapture of localCaptures) {
      if (cloudIds.has(localCapture.id)) {
        await runRequest("readwrite", (store) => store.delete(localCapture.id)).catch(() => undefined);
        continue;
      }
      try {
        const migrated = await saveCloudCapture(localCapture, true);
        migratedCaptures.push(migrated);
        await runRequest("readwrite", (store) => store.delete(localCapture.id));
      } catch {
        pendingLocalCaptures.push(localCapture);
      }
    }

    return [...cloudCaptures, ...migratedCaptures, ...pendingLocalCaptures]
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }
  return listLocalCaptures(workspaceId);
}

export async function saveCapture(input: NewCaptureItem) {
  const capture: CaptureItem = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    storagePath: null,
  };

  if (usesCloud(input.workspaceId) && supabase) {
    return saveCloudCapture(capture);
  }

  await runRequest("readwrite", (store) => store.put(capture));
  return capture;
}

export async function loadCaptureBlob(capture: CaptureItem) {
  if (capture.blob) return capture.blob;
  if (!capture.storagePath || !usesCloud(capture.workspaceId) || !supabase) return null;
  const { data, error } = await supabase.storage.from(captureBucket).download(capture.storagePath);
  if (error) throw new Error("Não foi possível abrir o arquivo desta inspiração.");
  return data;
}

export async function deleteCapture(capture: CaptureItem) {
  if (usesCloud(capture.workspaceId) && supabase) {
    const { error } = await supabase
      .from("capture_items")
      .delete()
      .eq("id", capture.id)
      .eq("user_id", capture.workspaceId);
    if (error) throw new Error("Não foi possível excluir esta captura.");
    if (capture.storagePath) {
      await supabase.storage.from(captureBucket).remove([capture.storagePath]);
    }
    return;
  }
  await runRequest("readwrite", (store) => store.delete(capture.id));
}
