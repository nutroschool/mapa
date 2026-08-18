"use client";

import {
  ArrowUpRight,
  AudioLines,
  FileText,
  Image as ImageIcon,
  Inbox,
  Lightbulb,
  Link2,
  LoaderCircle,
  Paperclip,
  FileUp,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteCapture,
  listCaptures,
  loadCaptureBlob,
  saveCapture,
  type CaptureItem,
  type CaptureKind,
} from "@/lib/capture-inbox";

type Props = {
  workspaceId: string;
  contentItemId: string;
  onClose: () => void;
  onNotify: (message: string) => void;
};

const kindDetails: Record<CaptureKind, { label: string; icon: typeof FileText }> = {
  audio: { label: "Áudio", icon: AudioLines },
  link: { label: "Link", icon: Link2 },
  image: { label: "Print", icon: ImageIcon },
  text: { label: "Texto", icon: FileText },
  pdf: { label: "PDF", icon: Paperclip },
};

function normalizeInspirationLink(value: string) {
  const trimmed = value.trim();
  const looksLikeLink = /^https?:\/\//i.test(trimmed)
    || /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#].*)?$/i.test(trimmed);
  if (!looksLikeLink) return "";
  return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
}

function captureKindForFile(file: File): Extract<CaptureKind, "audio" | "image" | "pdf"> | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf") return "pdf";
  return null;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(".0", "")} MB`;
}

export default function ScriptInspirationPanel({ workspaceId, contentItemId, onClose, onNotify }: Props) {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void listCaptures(workspaceId, contentItemId).then((items) => {
      if (!active) return;
      setCaptures(items);
      setSelectedId(items[0]?.id || "");
      setFeedback("");
      setLoading(false);
    }, (error) => {
      if (!active) return;
      setFeedback(error instanceof Error ? error.message : "Não foi possível abrir suas inspirações.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [contentItemId, workspaceId]);

  const visibleCaptures = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return captures;
    return captures.filter((capture) => (
      `${capture.title} ${capture.text} ${capture.url} ${capture.tags.join(" ")}`.toLowerCase().includes(term)
    ));
  }, [captures, search]);
  const selected = visibleCaptures.find((capture) => capture.id === selectedId) || visibleCaptures[0] || null;

  function chooseReferenceFile(file: File | null) {
    if (!file) return;
    const fileKind = captureKindForFile(file);
    if (!fileKind) {
      setDraftFile(null);
      setFeedback("Envie uma imagem, um PDF ou um arquivo de áudio.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setDraftFile(null);
      setFeedback("Envie um arquivo de até 20 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setDraftFile(file);
    setFeedback("");
    if (!draftTitle.trim()) setDraftTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  function clearReferenceFile() {
    setDraftFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function saveInspiration(event: React.FormEvent) {
    event.preventDefault();
    const content = draftContent.trim();
    if (!content && !draftFile) {
      setFeedback("Cole um link, escreva uma ideia ou envie um arquivo antes de salvar.");
      return;
    }

    setSaving(true);
    setFeedback("");
    try {
      const fileKind = draftFile ? captureKindForFile(draftFile) : null;
      const normalizedUrl = draftFile ? "" : normalizeInspirationLink(content);
      const fallbackTitle = draftFile
        ? draftFile.name.replace(/\.[^.]+$/, "")
        : normalizedUrl
          ? new URL(normalizedUrl).hostname.replace(/^www\./, "")
          : content.split("\n")[0].slice(0, 72);
      const saved = await saveCapture({
        workspaceId,
        contentItemId,
        kind: fileKind || (normalizedUrl ? "link" : "text"),
        title: draftTitle.trim() || fallbackTitle,
        text: normalizedUrl ? "" : content,
        url: normalizedUrl,
        tags: [],
        fileName: draftFile?.name || null,
        mimeType: draftFile?.type || null,
        fileSize: draftFile?.size || null,
        blob: draftFile,
      });
      setCaptures((items) => [saved, ...items]);
      setSelectedId(saved.id);
      setDraftTitle("");
      setDraftContent("");
      clearReferenceFile();
      onNotify("Inspiração salva neste roteiro.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar a inspiração neste roteiro.");
    } finally {
      setSaving(false);
    }
  }

  async function removeInspiration(capture: CaptureItem) {
    if (!window.confirm(`Excluir “${capture.title}” deste roteiro?`)) return;
    setFeedback("");
    try {
      await deleteCapture(capture);
      setCaptures((items) => items.filter((item) => item.id !== capture.id));
      setSelectedId((current) => current === capture.id ? "" : current);
      onNotify("Inspiração excluída deste roteiro.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível excluir a inspiração.");
    }
  }

  return (
    <aside className="script-inspiration-panel" aria-label="Inspirações deste roteiro">
      <div className="inspiration-panel-head">
        <span><Lightbulb size={18} /><span><small>ROTEIRO</small><strong>Inspirações</strong></span></span>
        <button className="icon-button" aria-label="Fechar inspirações" onClick={onClose}><X size={17} /></button>
      </div>

      <form className="script-inspiration-composer" onSubmit={saveInspiration}>
        <div><span><Plus size={15} /></span><span><strong>Adicionar neste roteiro</strong><small>Fica salvo somente neste vídeo.</small></span></div>
        <input aria-label="Título da inspiração" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Título (opcional)" maxLength={180} />
        <textarea aria-label="Conteúdo ou link da inspiração" value={draftContent} onChange={(event) => setDraftContent(event.target.value)} placeholder="Cole um link ou escreva uma ideia..." rows={3} />
        <input
          ref={fileInputRef}
          className="capture-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf,audio/*"
          aria-label="Enviar arquivo de referência"
          onChange={(event) => chooseReferenceFile(event.target.files?.[0] || null)}
        />
        {draftFile ? (
          <div className="inspiration-file-selected">
            <span><Paperclip size={15} /></span>
            <span><strong>{draftFile.name}</strong><small>{formatBytes(draftFile.size)} · pronto para subir</small></span>
            <button type="button" aria-label="Remover arquivo de referência" onClick={clearReferenceFile}><X size={14} /></button>
          </div>
        ) : (
          <button type="button" className="button secondary small inspiration-file-button" onClick={() => fileInputRef.current?.click()}><FileUp size={15} /> Subir print, PDF ou áudio</button>
        )}
        <button className="button primary small" disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} {saving ? "Salvando..." : "Salvar neste roteiro"}</button>
      </form>

      <label className="inspiration-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar neste roteiro..." /></label>
      {feedback && <p className="inspiration-feedback" role="status">{feedback}</p>}

      {loading ? (
        <div className="inspiration-panel-empty"><LoaderCircle className="spin" size={23} /><span>Carregando inspirações...</span></div>
      ) : visibleCaptures.length ? (
        <>
          <div className="inspiration-list" role="listbox" aria-label="Inspirações salvas neste roteiro">
            {visibleCaptures.map((capture) => {
              const KindIcon = kindDetails[capture.kind].icon;
              return (
                <button key={capture.id} className={capture.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(capture.id)} role="option" aria-selected={capture.id === selected?.id}>
                  <span><KindIcon size={15} /></span>
                  <span><strong>{capture.title}</strong><small>{kindDetails[capture.kind].label}{capture.tags.length ? ` · ${capture.tags.slice(0, 2).join(", ")}` : ""}</small></span>
                </button>
              );
            })}
          </div>
          {selected && <InspirationPreview key={selected.id} capture={selected} onDelete={() => void removeInspiration(selected)} />}
        </>
      ) : (
        <div className="inspiration-panel-empty">
          <span><Inbox size={25} /></span>
          <strong>{captures.length ? "Nada encontrado" : "Nenhuma inspiração neste roteiro"}</strong>
          <p>{captures.length ? "Tente outra palavra na busca." : "Cole um link ou escreva uma ideia acima. Ela ficará vinculada somente a este vídeo."}</p>
        </div>
      )}
    </aside>
  );
}

function InspirationPreview({ capture, onDelete }: { capture: CaptureItem; onDelete: () => void }) {
  const [objectUrl, setObjectUrl] = useState(() => capture.blob ? URL.createObjectURL(capture.blob) : "");
  const [loadingFile, setLoadingFile] = useState(Boolean(capture.storagePath && !capture.blob));

  useEffect(() => {
    let active = true;
    let nextUrl = capture.blob ? objectUrl : "";
    if (!nextUrl && capture.storagePath) {
      void loadCaptureBlob(capture).then((blob) => {
        if (!active || !blob) return;
        nextUrl = URL.createObjectURL(blob);
        setObjectUrl(nextUrl);
        setLoadingFile(false);
      }, () => setLoadingFile(false));
    }
    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  // The preview is keyed by capture id, so its object URL belongs to this mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.id]);

  return (
    <article className="inspiration-preview">
      <span className="capture-type">{kindDetails[capture.kind].label}</span>
      <h3>{capture.title}</h3>
      {capture.kind === "image" && objectUrl && <button className="inspiration-image" onClick={() => window.open(objectUrl, "_blank", "noopener,noreferrer")}><Image src={objectUrl} alt={capture.title} fill unoptimized sizes="330px" /></button>}
      {capture.text && <p>{capture.text}</p>}
      {capture.kind === "audio" && objectUrl && <audio controls preload="metadata" src={objectUrl} />}
      {capture.kind === "link" && <a href={capture.url} target="_blank" rel="noreferrer"><Link2 size={14} /><span>Abrir referência</span><ArrowUpRight size={14} /></a>}
      {capture.kind === "pdf" && objectUrl && <a href={objectUrl} target="_blank" rel="noreferrer"><Paperclip size={14} /><span>Ler {capture.fileName || "PDF"}</span><ArrowUpRight size={14} /></a>}
      {loadingFile && <small className="inspiration-file-loading"><LoaderCircle className="spin" size={13} /> Preparando arquivo...</small>}
      <div className="inspiration-saved-row"><span><Lightbulb size={13} /> Salva neste roteiro</span><button type="button" aria-label={`Excluir inspiração ${capture.title}`} onClick={onDelete}><Trash2 size={14} /></button></div>
    </article>
  );
}
