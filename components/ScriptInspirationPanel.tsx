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
  Plus,
  Search,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  listCaptures,
  loadCaptureBlob,
  type CaptureItem,
  type CaptureKind,
} from "@/lib/capture-inbox";

type Props = {
  workspaceId: string;
  onClose: () => void;
  onOpenInbox: () => void;
  onUseCapture: (capture: CaptureItem) => void;
};

const kindDetails: Record<CaptureKind, { label: string; icon: typeof FileText }> = {
  audio: { label: "Áudio", icon: AudioLines },
  link: { label: "Link", icon: Link2 },
  image: { label: "Print", icon: ImageIcon },
  text: { label: "Texto", icon: FileText },
  pdf: { label: "PDF", icon: Paperclip },
};

export default function ScriptInspirationPanel({ workspaceId, onClose, onOpenInbox, onUseCapture }: Props) {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    void listCaptures(workspaceId).then((items) => {
      if (!active) return;
      setCaptures(items);
      setSelectedId(items[0]?.id || "");
      setLoading(false);
    }, (error) => {
      if (!active) return;
      setFeedback(error instanceof Error ? error.message : "Não foi possível abrir suas inspirações.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [workspaceId]);

  const visibleCaptures = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return captures;
    return captures.filter((capture) => (
      `${capture.title} ${capture.text} ${capture.url} ${capture.tags.join(" ")}`.toLowerCase().includes(term)
    ));
  }, [captures, search]);
  const selected = visibleCaptures.find((capture) => capture.id === selectedId) || visibleCaptures[0] || null;

  return (
    <aside className="script-inspiration-panel" aria-label="Inspirações do Inbox">
      <div className="inspiration-panel-head">
        <span><Lightbulb size={18} /><span><small>INBOX</small><strong>Inspirações</strong></span></span>
        <button className="icon-button" aria-label="Fechar inspirações" onClick={onClose}><X size={17} /></button>
      </div>
      <label className="inspiration-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nas capturas..." /></label>

      {loading ? (
        <div className="inspiration-panel-empty"><LoaderCircle className="spin" size={23} /><span>Carregando inspirações...</span></div>
      ) : feedback ? (
        <div className="inspiration-panel-empty"><Inbox size={24} /><span>{feedback}</span></div>
      ) : visibleCaptures.length ? (
        <>
          <div className="inspiration-list" role="listbox" aria-label="Capturas disponíveis">
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
          {selected && <InspirationPreview key={selected.id} capture={selected} onUse={() => onUseCapture(selected)} />}
        </>
      ) : (
        <div className="inspiration-panel-empty">
          <span><Inbox size={25} /></span>
          <strong>{captures.length ? "Nada encontrado" : "Nenhuma captura ainda"}</strong>
          <p>{captures.length ? "Tente outra palavra na busca." : "Salve um áudio, link, print, texto ou PDF para consultar enquanto escreve."}</p>
        </div>
      )}

      <button className="button secondary inspiration-open-inbox" onClick={onOpenInbox}><Plus size={16} /> Abrir Capturas</button>
    </aside>
  );
}

function InspirationPreview({ capture, onUse }: { capture: CaptureItem; onUse: () => void }) {
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
      <button className="button primary small" onClick={onUse}><Plus size={15} /> Inserir no roteiro</button>
    </article>
  );
}
