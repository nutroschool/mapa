"use client";

import {
  ArrowUpRight,
  AudioLines,
  Check,
  ClipboardPaste,
  FileText,
  FileUp,
  Filter,
  Image as ImageIcon,
  Inbox,
  Lightbulb,
  Link2,
  LoaderCircle,
  Mic2,
  Paperclip,
  Plus,
  Square,
  Tags,
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
  search: string;
  openComposerToken: number;
  onCreateContent: (capture: CaptureItem) => void;
  onNotify: (message: string) => void;
};

const captureOptions: { kind: CaptureKind; label: string; helper: string; icon: typeof Mic2 }[] = [
  { kind: "audio", label: "Áudio", helper: "Grave até 2 min", icon: Mic2 },
  { kind: "link", label: "Link", helper: "Artigo, post ou vídeo", icon: Link2 },
  { kind: "image", label: "Print", helper: "Envie ou cole", icon: ImageIcon },
  { kind: "text", label: "Texto", helper: "Ideia ou trecho", icon: FileText },
  { kind: "pdf", label: "PDF", helper: "Referência completa", icon: Paperclip },
];

const kindLabels: Record<CaptureKind, string> = {
  audio: "Áudio",
  link: "Link",
  image: "Print",
  text: "Texto",
  pdf: "PDF",
};

function formatBytes(value: number | null) {
  if (!value) return "";
  const units = ["B", "KB", "MB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(candidate).toString();
}

export default function CaptureInbox({ workspaceId, search, openComposerToken, onCreateContent, onNotify }: Props) {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [dismissedComposerToken, setDismissedComposerToken] = useState(0);
  const [kind, setKind] = useState<CaptureKind>("text");
  const [filter, setFilter] = useState<"all" | CaptureKind>("all");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void listCaptures(workspaceId).then((items) => {
      if (!active) return;
      setCaptures(items);
      setFeedback("");
      setLoading(false);
    }, (error) => {
      if (!active) return;
      setFeedback(error instanceof Error ? error.message : "Não foi possível carregar o Inbox.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds((seconds) => {
        if (seconds >= 119) {
          mediaRecorderRef.current?.stop();
          return 120;
        }
        return seconds + 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(() => () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const filteredCaptures = useMemo(() => captures.filter((capture) => {
    if (filter !== "all" && capture.kind !== filter) return false;
    const haystack = `${capture.title} ${capture.text} ${capture.url} ${capture.tags.join(" ")} ${capture.fileName || ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  }), [captures, filter, search]);
  const composerVisible = composerOpen || openComposerToken > dismissedComposerToken;

  function resetComposer() {
    setTitle("");
    setText("");
    setLink("");
    setTags("");
    setFile(null);
    setAudioBlob(null);
    setRecordingSeconds(0);
    setFeedback("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function chooseKind(nextKind: CaptureKind) {
    if (recording) mediaRecorderRef.current?.stop();
    resetComposer();
    setKind(nextKind);
    setComposerOpen(true);
  }

  function closeComposer() {
    resetComposer();
    setComposerOpen(false);
    setDismissedComposerToken(openComposerToken);
  }

  async function startRecording() {
    setFeedback("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFeedback("Este navegador não oferece gravação de áudio. Você ainda pode anexar um arquivo de áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setAudioBlob(null);
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob.size ? blob : null);
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };
      recorder.start(500);
      setRecording(true);
    } catch {
      setFeedback("Não foi possível acessar o microfone. Autorize o navegador ou envie um áudio pronto.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }

  function chooseFile(nextFile: File | null) {
    if (!nextFile) return;
    if (nextFile.size > 20 * 1024 * 1024) {
      setFeedback("Use um arquivo de até 20 MB nesta versão local.");
      return;
    }
    if (kind === "image" && !nextFile.type.startsWith("image/")) {
      setFeedback("Escolha uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (kind === "pdf" && nextFile.type !== "application/pdf") {
      setFeedback("Escolha um arquivo PDF.");
      return;
    }
    if (kind === "audio" && !nextFile.type.startsWith("audio/")) {
      setFeedback("Escolha um arquivo de áudio.");
      return;
    }
    setFile(nextFile);
    setFeedback("");
    if (!title) setTitle(nextFile.name.replace(/\.[^.]+$/, ""));
  }

  async function pastePrint() {
    setFeedback("");
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await clipboardItem.getType(imageType);
        chooseFile(new File([blob], `print-${crypto.randomUUID()}.png`, { type: imageType }));
        return;
      }
      setFeedback("A área de transferência não contém uma imagem.");
    } catch {
      setFeedback("O navegador bloqueou a leitura. Use “Escolher print” ou cole a imagem nesta tela.");
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLElement>) {
    const image = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!image) return;
    event.preventDefault();
    setKind("image");
    setComposerOpen(true);
    chooseFile(image);
  }

  async function submitCapture(event: React.FormEvent) {
    event.preventDefault();
    setFeedback("");
    let normalizedUrl = "";
    try {
      if (kind === "link") normalizedUrl = normalizeLink(link);
    } catch {
      setFeedback("Digite um link válido, como instagram.com/p/... ou pubmed.ncbi.nlm.nih.gov/...");
      return;
    }

    const attachment = kind === "audio" ? (audioBlob || file) : file;
    if (kind === "text" && !text.trim()) return setFeedback("Escreva o trecho ou a ideia que deseja guardar.");
    if (kind === "link" && !normalizedUrl) return setFeedback("Cole o link que deseja guardar.");
    if (["image", "pdf", "audio"].includes(kind) && !attachment) return setFeedback("Adicione o arquivo antes de salvar.");

    setSaving(true);
    try {
      const saved = await saveCapture({
        workspaceId,
        kind,
        title: title.trim() || (kind === "text" ? text.trim().slice(0, 72) : `${kindLabels[kind]} sem título`),
        text: text.trim(),
        url: normalizedUrl,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
        fileName: attachment instanceof File ? attachment.name : kind === "audio" ? `audio-${crypto.randomUUID()}.webm` : null,
        mimeType: attachment?.type || null,
        fileSize: attachment?.size || null,
        blob: attachment || null,
      });
      setCaptures((items) => [saved, ...items]);
      resetComposer();
      setComposerOpen(false);
      setDismissedComposerToken(openComposerToken);
      onNotify("Inspiração salva no Inbox.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar a captura.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCapture(capture: CaptureItem) {
    if (!window.confirm(`Excluir “${capture.title}” do Inbox?`)) return;
    try {
      await deleteCapture(capture);
      setCaptures((items) => items.filter((item) => item.id !== capture.id));
      onNotify("Captura excluída.");
    } catch {
      onNotify("Não foi possível excluir esta captura.");
    }
  }

  return (
    <section className="capture-inbox" onPaste={handlePaste}>
      <div className="capture-shortcuts" aria-label="Formas de captura rápida">
        {captureOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button key={option.kind} className={kind === option.kind && composerVisible ? "active" : ""} onClick={() => chooseKind(option.kind)}>
              <span><Icon size={20} /></span>
              <span><strong>{option.label}</strong><small>{option.helper}</small></span>
              <Plus size={16} />
            </button>
          );
        })}
      </div>

      {composerVisible && (
        <form className="panel capture-composer" onSubmit={submitCapture}>
          <div className="capture-composer-head">
            <span className="capture-kind-icon">{kind === "audio" ? <AudioLines size={22} /> : kind === "link" ? <Link2 size={22} /> : kind === "image" ? <ImageIcon size={22} /> : kind === "pdf" ? <Paperclip size={22} /> : <FileText size={22} />}</span>
            <div><span className="eyebrow">CAPTURA RÁPIDA · {kindLabels[kind].toUpperCase()}</span><h2>Guardar inspiração</h2></div>
            <button type="button" className="icon-button" aria-label="Fechar captura" onClick={closeComposer}><X size={19} /></button>
          </div>

          <div className="capture-form-grid">
            <label>Título curto<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="O que você quer lembrar?" /></label>
            <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Ex.: obesidade, hook, estudo" /></label>
          </div>

          {kind === "text" && <label>Trecho ou ideia<textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Cole uma frase, insight, dado ou ideia ainda crua..." /></label>}
          {kind === "link" && <><label>Link<input inputMode="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://..." /></label><label>Por que vale guardar? <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="Registre o ângulo, a frase ou a ideia que chamou sua atenção." /></label></>}

          {kind === "audio" && (
            <div className={`audio-recorder ${recording ? "recording" : ""}`}>
              <span className="recording-orb"><Mic2 size={23} /></span>
              <div><strong>{recording ? "Gravando inspiração..." : audioBlob || file ? "Áudio pronto para salvar" : "Grave uma ideia antes que ela escape"}</strong><small>{recording ? `${formatTimer(recordingSeconds)} de 02:00` : "Máximo de 2 minutos"}</small></div>
              {recording
                ? <button type="button" className="button danger" onClick={stopRecording}><Square size={16} /> Parar</button>
                : <button type="button" className="button primary" onClick={() => void startRecording()}><Mic2 size={16} /> {audioBlob ? "Gravar novamente" : "Gravar agora"}</button>}
              <span className="capture-or">ou</span>
              <button type="button" className="button secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={16} /> Enviar áudio</button>
            </div>
          )}

          {(kind === "image" || kind === "pdf") && (
            <div className={`capture-upload-zone ${file ? "has-file" : ""}`}>
              <span>{kind === "image" ? <ImageIcon size={27} /> : <Paperclip size={27} />}</span>
              <div><strong>{file ? file.name : kind === "image" ? "Adicione um print ou imagem" : "Adicione o PDF de referência"}</strong><small>{file ? `${formatBytes(file.size)} · pronto para salvar` : "Arquivo de até 20 MB"}</small></div>
              <button type="button" className="button secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={16} /> Escolher {kind === "image" ? "print" : "PDF"}</button>
              {kind === "image" && <button type="button" className="button ghost" onClick={() => void pastePrint()}><ClipboardPaste size={16} /> Colar print</button>}
            </div>
          )}

          <input
            ref={fileInputRef}
            className="capture-file-input"
            type="file"
            accept={kind === "audio" ? "audio/*" : kind === "image" ? "image/png,image/jpeg,image/webp" : "application/pdf"}
            onChange={(event) => chooseFile(event.target.files?.[0] || null)}
          />

          {kind !== "text" && kind !== "link" && <label>Nota sobre a captura<textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="O que chamou sua atenção e como isso pode virar conteúdo?" /></label>}
          {feedback && <div className="capture-feedback"><Lightbulb size={17} /><span>{feedback}</span></div>}

          <div className="modal-actions">
            <small className="local-only-note"><Check size={15} /> {workspaceId === "local" ? "Salvo neste dispositivo" : "Sincronizado com seu espaço"}</small>
            <button type="button" className="button ghost" onClick={closeComposer}>Cancelar</button>
            <button type="submit" className="button primary" disabled={saving || recording}>{saving ? <LoaderCircle className="spin" size={17} /> : <Inbox size={17} />} Salvar no Inbox</button>
          </div>
        </form>
      )}

      <div className="capture-library-head">
        <div><span className="eyebrow">BANCO DE INSPIRAÇÕES</span><h2>{captures.length} {captures.length === 1 ? "captura salva" : "capturas salvas"}</h2></div>
        <div className="capture-filters"><Filter size={16} />
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas</button>
          {captureOptions.map((option) => <button key={option.kind} className={filter === option.kind ? "active" : ""} onClick={() => setFilter(option.kind)}>{option.label}</button>)}
        </div>
      </div>

      {loading ? (
        <section className="panel capture-empty"><LoaderCircle className="spin" size={28} /><strong>Carregando seu Inbox...</strong></section>
      ) : filteredCaptures.length ? (
        <div className="capture-grid">
          {filteredCaptures.map((capture) => (
            <CaptureCard key={capture.id} capture={capture} onCreateContent={onCreateContent} onDelete={() => void removeCapture(capture)} />
          ))}
        </div>
      ) : (
        <section className="panel capture-empty">
          <span><Inbox size={31} /></span>
          <strong>{captures.length ? "Nenhuma captura neste filtro" : "Seu Inbox está pronto"}</strong>
          <p>{captures.length ? "Escolha outro formato ou ajuste a busca." : "Guarde áudios, links, prints, textos e PDFs. Depois transforme qualquer inspiração em pauta com um clique."}</p>
          {!captures.length && <button className="button primary" onClick={() => chooseKind("text")}><Plus size={17} /> Fazer primeira captura</button>}
        </section>
      )}
    </section>
  );
}

function CaptureCard({ capture, onCreateContent, onDelete }: { capture: CaptureItem; onCreateContent: (capture: CaptureItem) => void; onDelete: () => void }) {
  const [objectUrl, setObjectUrl] = useState(() => capture.blob ? URL.createObjectURL(capture.blob) : "");

  useEffect(() => {
    let active = true;
    let nextObjectUrl = objectUrl;
    if (!nextObjectUrl && capture.storagePath) {
      void loadCaptureBlob(capture).then((blob) => {
        if (!active || !blob) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      });
    }
    return () => {
      active = false;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  // The capture identity owns the generated object URL for its full card lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.id]);

  const KindIcon = captureOptions.find((option) => option.kind === capture.kind)?.icon || FileText;
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(capture.createdAt));

  return (
    <article className={`panel capture-card kind-${capture.kind}`}>
      {capture.kind === "image" && objectUrl && <button className="capture-image-preview" onClick={() => window.open(objectUrl, "_blank", "noopener,noreferrer")}><Image src={objectUrl} alt={`Print salvo: ${capture.title}`} fill unoptimized sizes="(max-width: 700px) 100vw, 33vw" /></button>}
      <div className="capture-card-top">
        <span className="capture-type"><KindIcon size={15} /> {kindLabels[capture.kind]}</span>
        <span>{date}</span>
      </div>
      <h3>{capture.title}</h3>
      {capture.text && <p>{capture.text}</p>}
      {capture.kind === "audio" && objectUrl && <audio controls preload="metadata" src={objectUrl} />}
      {capture.kind === "link" && <a className="capture-link" href={capture.url} target="_blank" rel="noreferrer"><Link2 size={15} /><span>{capture.url.replace(/^https?:\/\//, "").slice(0, 70)}</span><ArrowUpRight size={15} /></a>}
      {capture.kind === "pdf" && objectUrl && <a className="capture-attachment" href={objectUrl} target="_blank" rel="noreferrer"><Paperclip size={18} /><span><strong>{capture.fileName}</strong><small>{formatBytes(capture.fileSize)}</small></span><ArrowUpRight size={16} /></a>}
      {capture.kind === "image" && capture.fileName && <small className="capture-file-meta">{capture.fileName} · {formatBytes(capture.fileSize)}</small>}
      {capture.tags.length > 0 && <div className="capture-tags"><Tags size={13} />{capture.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
      <div className="capture-card-actions">
        <button className="button secondary" onClick={() => onCreateContent(capture)}><Lightbulb size={16} /> Transformar em pauta</button>
        <button className="icon-button danger" aria-label={`Excluir ${capture.title}`} onClick={onDelete}><Trash2 size={16} /></button>
      </div>
    </article>
  );
}
