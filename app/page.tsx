"use client";

import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Bookmark,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Clock3,
  Eye,
  ExternalLink,
  FileText,
  Filter,
  FolderOpen,
  GripVertical,
  Heart,
  Instagram,
  LayoutDashboard,
  Lightbulb,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Maximize2,
  Minus,
  Pause,
  PencilLine,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Bold,
  Palette,
  Save,
  Search,
  Settings2,
  Sparkles,
  StickyNote,
  Target,
  Type,
  Trash2,
  TrendingUp,
  Users,
  UserPlus,
  Video,
  RotateCcw,
  FlipHorizontal2,
  X,
  Zap,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  invokeInstagram,
  type InstagramAccount,
  type InstagramConnectionState,
  type InstagramMetrics,
} from "@/lib/instagram";
import {
  invokeGoogleDrive,
  uploadVideoToGoogleDrive,
  type GoogleDriveConnectionState,
  type GoogleDriveStatus,
} from "@/lib/google-drive";
import InstagramPerformance from "@/components/InstagramPerformance";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type View = "hoje" | "calendario" | "roteiros" | "desempenho";
type Status = "Ideia" | "Roteiro" | "Gravação" | "Edição" | "Agendado" | "Publicado";
type FunnelStage = "Topo de funil" | "Meio de funil" | "Fundo de funil";

type ContentItem = {
  id: string;
  title: string;
  format: "Reel" | "Carrossel" | "Stories" | "YouTube";
  pillar: string;
  status: Status;
  date: string;
  duration: string;
  hook: string;
  script: string;
  cta: string;
  notes: string;
  driveFileId: string | null;
  driveFileName: string | null;
  driveWebViewLink: string | null;
  driveMimeType: string | null;
  driveFileSize: number | null;
  driveUploadedAt: string | null;
};

type ContentRow = {
  id: string;
  title: string;
  format: ContentItem["format"];
  pillar: string;
  status: Status;
  scheduled_date: string;
  duration: string;
  hook: string;
  script: string;
  cta: string;
  notes: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  drive_web_view_link: string | null;
  drive_mime_type: string | null;
  drive_file_size: number | null;
  drive_uploaded_at: string | null;
};

const initialContents: ContentItem[] = [];

const statusOrder: Status[] = ["Ideia", "Roteiro", "Gravação", "Edição", "Agendado", "Publicado"];
const funnelStages: FunnelStage[] = ["Topo de funil", "Meio de funil", "Fundo de funil"];
const weekDays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const storageKey = "mapa-content-items-v2";
const instagramDemoKey = "mapa-instagram-demo-v2";
const appTimeZone = "America/Sao_Paulo";

function dateIsoInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const todayIso = dateIsoInTimeZone();

function formatTodayHeading(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: appTimeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00-03:00`)).toLocaleUpperCase("pt-BR");
}
const instagramCallbackMessages: Record<string, string> = {
  missing_state: "A Meta não devolveu a confirmação de segurança. Inicie a conexão novamente.",
  invalid_state: "A tentativa de conexão expirou. Inicie novamente e conclua o login em até 10 minutos.",
  token_exchange: "A Meta não conseguiu validar o código de acesso. Tente conectar novamente.",
  long_token_exchange: "A Meta não conseguiu concluir a autorização prolongada. Tente novamente.",
  profile_fetch: "A autorização foi aceita, mas a Meta não liberou os dados da conta profissional. Confirme se a conta é Comercial ou Criador.",
  connection_save: "A conta foi autorizada, mas o MAPA não conseguiu salvar a conexão. Tente novamente.",
  callback_failed: "A Meta não concluiu a autorização. Tente novamente.",
};

const googleDriveCallbackMessages: Record<string, string> = {
  missing_state: "O Google não devolveu a confirmação de segurança. Inicie a conexão novamente.",
  invalid_state: "A tentativa de conexão expirou. Inicie novamente e conclua em até 10 minutos.",
  token_exchange: "O Google não conseguiu validar a autorização. Tente conectar novamente.",
  scope_validation: "O Google Drive foi conectado sem a permissão para enviar vídeos. Conecte novamente e autorize o acesso solicitado.",
  profile_fetch: "A conta foi autorizada, mas o Google não liberou a identificação necessária.",
  connection_save: "A conta foi autorizada, mas o MAPA não conseguiu salvar a conexão.",
  folder_setup: "A conta foi conectada, mas a pasta MAPA Conteúdos não pôde ser preparada.",
  callback_proxy: "O MAPA não conseguiu concluir o retorno do Google. Tente conectar novamente.",
  callback_failed: "O Google Drive não concluiu a autorização. Tente novamente.",
};

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "hoje", label: "Hoje", icon: LayoutDashboard },
  { id: "calendario", label: "Calendário", icon: CalendarDays },
  { id: "roteiros", label: "Roteiros", icon: FileText },
  { id: "desempenho", label: "Desempenho", icon: BarChart3 },
];

const formatColors: Record<ContentItem["format"], string> = {
  Reel: "coral",
  Carrossel: "violet",
  Stories: "amber",
  YouTube: "red",
};

const scriptBlockDefinitions = [
  { id: "headline", number: "01", title: "HEADLINE", helper: "A frase que interrompe o scroll", placeholder: "Escreva a headline principal...", rows: 3 },
  { id: "mystery", number: "02", title: "INTENSIFICADOR DE MISTÉRIO", helper: "Aumente a curiosidade sem entregar a resposta", placeholder: "Crie tensão e abra uma lacuna de curiosidade...", rows: 4 },
  { id: "saveCta", number: "03", title: "CTA DE SALVAMENTO", helper: "Dê um motivo claro para salvar agora", placeholder: "Convide a pessoa a salvar este conteúdo...", rows: 3 },
  { id: "notableOne", number: "04", title: "CONTEÚDO NOTÁVEL 1", helper: "Primeiro elemento memorável e útil", placeholder: "Desenvolva o primeiro conteúdo notável...", rows: 5 },
  { id: "notableTwo", number: "05", title: "CONTEÚDO NOTÁVEL 2", helper: "Aprofunde com uma segunda ideia forte", placeholder: "Desenvolva o segundo conteúdo notável...", rows: 5 },
  { id: "shareCta", number: "06", title: "CTA DE COMPARTILHAMENTO", helper: "Conecte o tema a alguém que precisa recebê-lo", placeholder: "Convide a pessoa a compartilhar...", rows: 3 },
  { id: "notableThree", number: "07", title: "CONTEÚDO NOTÁVEL", helper: "Entregue a revelação ou aplicação prática", placeholder: "Entregue a revelação e o valor prático...", rows: 5 },
  { id: "belief", number: "08", title: "CRENÇA", helper: "A ideia central que deve permanecer", placeholder: "Registre a crença que sustenta a mensagem...", rows: 4 },
  { id: "presentation", number: "09", title: "APRESENTAÇÃO E CTAs FINAIS", helper: "Apresente-se e feche com a próxima ação", placeholder: "Escreva sua apresentação e os CTAs finais...", rows: 5 },
  { id: "caption", number: "10", title: "CAPTION PRONTA · LEGENDA", helper: "Legenda final pronta para copiar e publicar", placeholder: "Escreva a legenda completa, incluindo CTA e hashtags...", rows: 7 },
] as const;

type ScriptBlockId = (typeof scriptBlockDefinitions)[number]["id"];
type ScriptBlockDefinition = (typeof scriptBlockDefinitions)[number];
type ScriptBlock = { html: string; note: string; color: string };
type ScriptDocument = { version: 2; blocks: Record<ScriptBlockId, ScriptBlock> };

const scriptColorPresets = ["#333949", "#b84f3f", "#4770b8", "#7855ad", "#397a57"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextToRichHtml(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function sanitizeRichTextHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, (tag) => {
      if (/^<br\s*\/?\s*>$/i.test(tag)) return "<br>";
      if (/^<(?:b|strong)(?:\s[^>]*)?>$/i.test(tag)) return "<strong>";
      if (/^<\/(?:b|strong)>$/i.test(tag)) return "</strong>";
      if (/^<\/(?:div|p)>$/i.test(tag)) return "<br>";
      return "";
    })
    .replace(/(?:<br>){3,}/g, "<br><br>");
}

function richTextToPlainText(value: string) {
  return value
    .replace(/<br>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFunnelStage(value: string): FunnelStage {
  return funnelStages.includes(value as FunnelStage) ? value as FunnelStage : "Topo de funil";
}

function createEmptyScriptDocument(): ScriptDocument {
  return {
    version: 2,
    blocks: Object.fromEntries(
      scriptBlockDefinitions.map((definition) => [
        definition.id,
        { html: "", note: "", color: scriptColorPresets[0] },
      ]),
    ) as Record<ScriptBlockId, ScriptBlock>,
  };
}

function parseScriptDocument(item: ContentItem): ScriptDocument {
  const document = createEmptyScriptDocument();

  if (item.script.trim()) {
    try {
      const parsed = JSON.parse(item.script) as { version?: unknown; blocks?: Record<string, unknown> };
      if ((parsed.version === 1 || parsed.version === 2) && parsed.blocks && typeof parsed.blocks === "object") {
        scriptBlockDefinitions.forEach((definition) => {
          const value = parsed.blocks?.[definition.id];
          if (!value || typeof value !== "object") return;
          const block = value as Partial<ScriptBlock> & { text?: string; bold?: boolean };
          const legacyText = typeof block.text === "string" ? block.text : "";
          const legacyHtml = plainTextToRichHtml(legacyText);
          document.blocks[definition.id] = {
            html: typeof block.html === "string"
              ? sanitizeRichTextHtml(block.html)
              : block.bold === true && legacyHtml
                ? `<strong>${legacyHtml}</strong>`
                : legacyHtml,
            note: typeof block.note === "string" ? block.note : "",
            color: typeof block.color === "string" ? block.color : scriptColorPresets[0],
          };
        });
        return document;
      }
    } catch {
      // Roteiros antigos em texto puro são convertidos abaixo.
    }
  }

  const legacyText = [item.hook, item.script, item.cta, item.notes]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");
  const headingPattern = /(?:^|\n)\s*(?:BLOCO\s*([1-9])\s*[·.\-–—:]\s*(?:HEADLINE|INTENSIFICADOR\s+DE\s+MISTÉRIO|CTA\s+DE\s+SALVAMENTO|CONTEÚDO\s+NOTÁVEL(?:\s*[123])?|CTA\s+DE\s+COMPARTILHAMENTO|CRENÇA|APRESENTAÇÃO\s+E\s+CTAS\s+FINAIS)|(?:BLOCO\s*10\s*[·.\-–—:]\s*)?CAPTION\s+PRONTA(?:\s+LEGENDA)?)\s*/gim;
  const headings = Array.from(legacyText.matchAll(headingPattern));

  if (headings.length) {
    headings.forEach((heading, index) => {
      const blockNumber = heading[1] ? Number(heading[1]) : 10;
      const definition = scriptBlockDefinitions[blockNumber - 1];
      if (!definition) return;
      const start = (heading.index ?? 0) + heading[0].length;
      const end = headings[index + 1]?.index ?? legacyText.length;
      document.blocks[definition.id].html = plainTextToRichHtml(legacyText.slice(start, end).trim());
    });
    return document;
  }

  document.blocks.headline.html = plainTextToRichHtml(item.hook.trim());
  document.blocks.notableOne.html = plainTextToRichHtml(item.script.trim());
  document.blocks.presentation.html = plainTextToRichHtml(item.cta.trim());
  document.blocks.presentation.note = item.notes.trim();
  return document;
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function rowToContent(row: ContentRow): ContentItem {
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    pillar: normalizeFunnelStage(row.pillar),
    status: row.status,
    date: row.scheduled_date,
    duration: row.duration,
    hook: row.hook,
    script: row.script,
    cta: row.cta,
    notes: row.notes,
    driveFileId: row.drive_file_id,
    driveFileName: row.drive_file_name,
    driveWebViewLink: row.drive_web_view_link,
    driveMimeType: row.drive_mime_type,
    driveFileSize: row.drive_file_size,
    driveUploadedAt: row.drive_uploaded_at,
  };
}

function contentToRow(item: ContentItem, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    title: item.title,
    format: item.format,
    pillar: item.pillar,
    status: item.status,
    scheduled_date: item.date,
    duration: item.duration,
    hook: item.hook,
    script: item.script,
    cta: item.cta,
    notes: item.notes,
    drive_file_id: item.driveFileId,
    drive_file_name: item.driveFileName,
    drive_web_view_link: item.driveWebViewLink,
    drive_mime_type: item.driveMimeType,
    drive_file_size: item.driveFileSize,
    drive_uploaded_at: item.driveUploadedAt,
  };
}

export default function Home() {
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const recoveryRequested = window.location.search.includes("auth=recovery")
      || window.location.hash.includes("type=recovery");
    const recoveryFrame = recoveryRequested
      ? window.requestAnimationFrame(() => setPasswordRecovery(true))
      : 0;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      if (recoveryFrame) window.cancelAnimationFrame(recoveryFrame);
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!authReady) return <AppLoading />;
  if (passwordRecovery) {
    return <AuthScreen initialMode="reset" onRecoveryComplete={() => setPasswordRecovery(false)} />;
  }
  if (isSupabaseConfigured && !user) return <AuthScreen />;

  return <Workspace user={user} />;
}

function Workspace({ user }: { user: User | null }) {
  const [view, setView] = useState<View>("hoje");
  const [contents, setContents] = useState<ContentItem[]>(initialContents);
  const [ready, setReady] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [instagramOpen, setInstagramOpen] = useState(false);
  const [instagramDemo, setInstagramDemo] = useState(false);
  const [instagramState, setInstagramState] = useState<InstagramConnectionState>("checking");
  const [instagramAccount, setInstagramAccount] = useState<InstagramAccount | null>(null);
  const [instagramMetrics, setInstagramMetrics] = useState<InstagramMetrics | null>(null);
  const [instagramPeriod, setInstagramPeriod] = useState<30 | 90>(30);
  const [instagramMetricsLoading, setInstagramMetricsLoading] = useState(false);
  const [instagramError, setInstagramError] = useState("");
  const [driveState, setDriveState] = useState<GoogleDriveConnectionState>("checking");
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
  const [driveModalContentId, setDriveModalContentId] = useState<string | null>(null);
  const [driveFile, setDriveFile] = useState<File | null>(null);
  const [driveUploadProgress, setDriveUploadProgress] = useState(0);
  const [driveError, setDriveError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [utilityModal, setUtilityModal] = useState<"help" | "notifications" | "profile" | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const saveTimersRef = useRef<Record<string, number>>({});
  const [newItem, setNewItem] = useState({
    title: "",
    format: "Reel" as ContentItem["format"],
    pillar: "Topo de funil" as FunnelStage,
    date: todayIso,
    status: "Ideia" as Status,
  });

  const loadInstagramMetrics = useCallback(async (periodDays: 30 | 90) => {
    setInstagramMetricsLoading(true);
    setInstagramError("");
    try {
      const metrics = await invokeInstagram<InstagramMetrics>({
        action: "metrics",
        period_days: periodDays,
      });
      setInstagramMetrics(metrics);
      setInstagramAccount(metrics.account);
      setInstagramState("connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar as métricas.";
      setInstagramError(message);
      if (message.includes("expirou") || message.includes("não conectado")) {
        setInstagramState("disconnected");
        setInstagramAccount(null);
      }
    } finally {
      setInstagramMetricsLoading(false);
    }
  }, []);

  const loadInstagramStatus = useCallback(async () => {
    setInstagramState("checking");
    try {
      const status = await invokeInstagram<{
        connected: boolean;
        account?: InstagramAccount;
      }>({ action: "status" });
      if (!status.connected || !status.account) {
        setInstagramState("disconnected");
        setInstagramAccount(null);
        setInstagramMetrics(null);
        return;
      }
      setInstagramState("connected");
      setInstagramAccount(status.account);
    } catch (error) {
      setInstagramState("error");
      setInstagramError(error instanceof Error ? error.message : "Não foi possível verificar o Instagram.");
    }
  }, []);

  const loadGoogleDriveStatus = useCallback(async () => {
    setDriveState("checking");
    setDriveError("");
    try {
      const status = await invokeGoogleDrive<GoogleDriveStatus>({ action: "status" });
      setDriveStatus(status);
      setDriveState(status.connected ? "connected" : "disconnected");
      if (status.requires_reconnect) {
        setDriveError("Reconecte seu Google Drive para autorizar o envio de vídeos.");
      }
    } catch (error) {
      setDriveStatus(null);
      setDriveState("error");
      setDriveError(error instanceof Error ? error.message : "Não foi possível verificar o Google Drive.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const saveTimers = saveTimersRef.current;

    async function loadWorkspace() {
      setInstagramDemo(window.localStorage.getItem(instagramDemoKey) === "true");

      if (supabase && user) {
        const { data, error } = await supabase
          .from("content_items")
          .select("id,title,format,pillar,status,scheduled_date,duration,hook,script,cta,notes,drive_file_id,drive_file_name,drive_web_view_link,drive_mime_type,drive_file_size,drive_uploaded_at")
          .eq("user_id", user.id)
          .order("scheduled_date", { ascending: true });

        if (!active) return;
        if (error) {
          setToast("Não foi possível carregar seus conteúdos. Tente novamente.");
          setReady(true);
          return;
        }

        const loaded = (data as ContentRow[]).map(rowToContent);
        setContents(loaded);
        setSelectedId(loaded[0]?.id ?? null);
        setReady(true);
        return;
      }

      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setContents(
            Array.isArray(parsed)
              ? parsed.map((item) => ({
                  ...item,
                  id: String(item.id),
                  pillar: normalizeFunnelStage(String(item.pillar || "")),
                  driveFileId: item.driveFileId || null,
                  driveFileName: item.driveFileName || null,
                  driveWebViewLink: item.driveWebViewLink || null,
                  driveMimeType: item.driveMimeType || null,
                  driveFileSize: typeof item.driveFileSize === "number" ? item.driveFileSize : null,
                  driveUploadedAt: item.driveUploadedAt || null,
                }))
              : initialContents,
          );
        } catch {
          setContents(initialContents);
        }
      }
      setReady(true);
    }

    const frame = window.requestAnimationFrame(() => void loadWorkspace());
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      Object.values(saveTimers).forEach((timer) => window.clearTimeout(timer));
    };
  }, [user]);

  useEffect(() => {
    let frame = 0;
    if (!user || !supabase) {
      frame = window.requestAnimationFrame(() => setInstagramState("disconnected"));
    } else {
      frame = window.requestAnimationFrame(() => void loadInstagramStatus());
    }
    return () => window.cancelAnimationFrame(frame);
  }, [loadInstagramStatus, user]);

  useEffect(() => {
    let frame = 0;
    if (!user || !supabase) {
      frame = window.requestAnimationFrame(() => setDriveState("disconnected"));
    } else {
      frame = window.requestAnimationFrame(() => void loadGoogleDriveStatus());
    }
    return () => window.cancelAnimationFrame(frame);
  }, [loadGoogleDriveStatus, user]);

  useEffect(() => {
    if (!user) return;
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const result = params.get("instagram");
      if (!result) return;
      const reason = params.get("reason") || "callback_failed";

      params.delete("instagram");
      params.delete("reason");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      setView("desempenho");

      if (result === "connected") {
        window.localStorage.removeItem(instagramDemoKey);
        setInstagramDemo(false);
        setToast("Instagram conectado com segurança.");
        void loadInstagramStatus();
        return;
      }
      if (result === "cancelled") {
        setToast("Conexão com o Instagram cancelada.");
        return;
      }
      setInstagramState("error");
      setInstagramError(instagramCallbackMessages[reason] || instagramCallbackMessages.callback_failed);
      setToast("Não foi possível conectar o Instagram.");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadInstagramStatus, user]);

  useEffect(() => {
    if (!user) return;
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const result = params.get("drive");
      if (!result) return;
      const reason = params.get("reason") || "callback_failed";
      const contentId = params.get("content");

      params.delete("drive");
      params.delete("reason");
      params.delete("content");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      setView("roteiros");
      if (contentId) setSelectedId(contentId);

      if (result === "connected") {
        setToast("Google Drive conectado. Agora escolha o vídeo.");
        void loadGoogleDriveStatus();
        if (contentId) setDriveModalContentId(contentId);
        return;
      }
      if (result === "cancelled") {
        setDriveState("disconnected");
        setToast("Conexão com o Google Drive cancelada.");
        return;
      }
      const message = googleDriveCallbackMessages[reason] || googleDriveCallbackMessages.callback_failed;
      setDriveState("error");
      setDriveError(message);
      setToast("Não foi possível conectar o Google Drive.");
      if (contentId) setDriveModalContentId(contentId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadGoogleDriveStatus, user]);

  useEffect(() => {
    if (
      view === "desempenho"
      && instagramState === "connected"
      && (!instagramMetrics || instagramMetrics.period_days !== instagramPeriod)
      && !instagramMetricsLoading
    ) {
      const frame = window.requestAnimationFrame(() => void loadInstagramMetrics(instagramPeriod));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [
    instagramMetrics,
    instagramMetricsLoading,
    instagramPeriod,
    instagramState,
    loadInstagramMetrics,
    view,
  ]);

  useEffect(() => {
    if (ready && !user) window.localStorage.setItem(storageKey, JSON.stringify(contents));
  }, [contents, ready, user]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const selected = contents.find((item) => item.id === selectedId) ?? contents[0];
  const driveModalContent = contents.find((item) => item.id === driveModalContentId) ?? null;
  const filteredContents = useMemo(
    () =>
      contents.filter((item) =>
        `${item.title} ${item.pillar} ${item.format}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [contents, search],
  );

  const published = contents.filter((item) => item.status === "Publicado").length;
  const scheduled = contents.filter((item) => item.status === "Agendado").length;
  const inProgress = contents.filter((item) => ["Roteiro", "Gravação", "Edição"].includes(item.status)).length;
  const weeklyGoal = Math.min(published, 5);
  const displayName = String(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "José Enrique");
  const firstName = displayName.split(" ")[0] || "José";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "JE";

  function announce(message: string) {
    setToast(message);
  }

  function changeStatus(id: string, status: Status) {
    const previous = contents.find((item) => item.id === id)?.status;
    if (!previous || previous === status) return;
    setContents((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    if (supabase && user) {
      void supabase
        .from("content_items")
        .update({ status })
        .eq("id", id)
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (!error) return;
          setContents((items) => items.map((item) => (
            item.id === id && item.status === status ? { ...item, status: previous } : item
          )));
          announce("Não foi possível salvar a nova fase. O conteúdo voltou à fase anterior.");
        });
    }
    announce(`Fase alterada para ${status}.`);
  }

  async function moveContentDate(id: string, date: string) {
    const current = contents.find((item) => item.id === id);
    if (!current || current.date === date) return;

    const previousDate = current.date;
    setContents((items) => items.map((item) => (item.id === id ? { ...item, date } : item)));

    if (supabase && user) {
      const { error } = await supabase
        .from("content_items")
        .update({ scheduled_date: date })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        setContents((items) => items.map((item) => (
          item.id === id && item.date === date ? { ...item, date: previousDate } : item
        )));
        announce("Não foi possível salvar a nova data. O conteúdo voltou ao dia anterior.");
        return;
      }
    }

    announce(`Conteúdo movido para ${formatShortDate(date)}.`);
  }

  async function deleteContent(id: string) {
    const target = contents.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(`Excluir “${target.title}”? Esta ação não pode ser desfeita.`)) return;

    if (supabase && user) {
      const { data, error } = await supabase
        .from("content_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        announce("Não foi possível excluir este conteúdo. Tente novamente.");
        return;
      }
    }

    const remaining = contents.filter((item) => item.id !== id);
    setContents(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
    announce(`“${target.title}” foi excluído.`);
  }

  function updateSelected(field: keyof ContentItem, value: string) {
    if (!selectedId || field === "id") return;
    const itemId = selectedId;
    setContents((items) => items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));

    if (supabase && user) {
      const client = supabase;
      const userId = user.id;
      window.clearTimeout(saveTimersRef.current[itemId]);
      saveTimersRef.current[itemId] = window.setTimeout(() => {
        const databaseField = field === "date" ? "scheduled_date" : field;
        void client
          .from("content_items")
          .update({ [databaseField]: value })
          .eq("id", itemId)
          .eq("user_id", userId)
          .then(({ error }) => {
            if (error) announce("Alteração não salva. Verifique sua conexão.");
          });
      }, 650);
    }
  }

  async function addContent(event: React.FormEvent) {
    event.preventDefault();
    if (!newItem.title.trim()) return;
    const item: ContentItem = {
      id: crypto.randomUUID(),
      ...newItem,
      title: newItem.title.trim(),
      duration: newItem.format === "Carrossel" ? "8 páginas" : "60s",
      hook: "",
      script: "",
      cta: "",
      notes: "",
      driveFileId: null,
      driveFileName: null,
      driveWebViewLink: null,
      driveMimeType: null,
      driveFileSize: null,
      driveUploadedAt: null,
    };
    setContents((items) => [...items, item]);
    setSelectedId(item.id);
    setAddOpen(false);
    setNewItem({ title: "", format: "Reel", pillar: "Topo de funil", date: todayIso, status: "Ideia" });
    if (supabase && user) {
      const { error } = await supabase.from("content_items").insert(contentToRow(item, user.id));
      if (error) {
        setContents((items) => items.filter((content) => content.id !== item.id));
        setSelectedId(null);
        announce("Não foi possível salvar o conteúdo. Tente novamente.");
        return;
      }
    }
    announce(user ? "Novo conteúdo salvo na nuvem." : "Novo conteúdo adicionado ao MAPA.");
  }

  function openAdd(date?: string) {
    if (date) setNewItem((item) => ({ ...item, date }));
    setAddOpen(true);
  }

  function enableInstagramDemo() {
    window.localStorage.setItem(instagramDemoKey, "true");
    setInstagramDemo(true);
    setInstagramOpen(false);
    announce("Modo demonstração ativado no painel.");
  }

  async function connectInstagram() {
    if (instagramState === "connecting") return;
    setInstagramState("connecting");
    setInstagramError("");
    try {
      const data = await invokeInstagram<{ authorization_url: string }>({
        action: "start",
        return_to: "/?view=desempenho",
      });
      window.location.assign(data.authorization_url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível iniciar a conexão.";
      setInstagramState("error");
      setInstagramError(message);
      announce(message);
    }
  }

  function openDriveUpload(contentId: string) {
    setDriveModalContentId(contentId);
    setDriveFile(null);
    setDriveUploadProgress(0);
    setDriveError(driveStatus?.requires_reconnect
      ? "Reconecte seu Google Drive para autorizar o envio de vídeos."
      : "");
    if (driveState === "error") void loadGoogleDriveStatus();
  }

  async function connectGoogleDrive(contentId: string) {
    if (driveState === "connecting") return;
    setDriveState("connecting");
    setDriveError("");
    try {
      const data = await invokeGoogleDrive<{ authorization_url: string }>({
        action: "start",
        return_to: `/?view=roteiros&content=${encodeURIComponent(contentId)}`,
      });
      window.location.assign(data.authorization_url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível iniciar a conexão com o Google Drive.";
      setDriveState("error");
      setDriveError(message);
      announce(message);
    }
  }

  async function disconnectGoogleDrive() {
    if (!window.confirm("Desconectar esta conta do Google Drive? Os vídeos já enviados não serão apagados.")) return;
    try {
      await invokeGoogleDrive<{ connected: false }>({ action: "disconnect" });
      setDriveState("disconnected");
      setDriveStatus(null);
      setDriveFile(null);
      setDriveUploadProgress(0);
      announce("Google Drive desconectado.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Não foi possível desconectar o Google Drive.");
    }
  }

  async function uploadDriveVideo(event: React.FormEvent) {
    event.preventDefault();
    const contentId = driveModalContentId;
    if (!contentId || !driveFile || driveState === "uploading") return;
    if (!driveFile.type.startsWith("video/")) {
      setDriveError("Selecione um arquivo de vídeo.");
      return;
    }

    setDriveState("uploading");
    setDriveUploadProgress(0);
    setDriveError("");
    try {
      const { file } = await uploadVideoToGoogleDrive(contentId, driveFile, setDriveUploadProgress);
      setContents((items) => items.map((item) => item.id === contentId ? {
        ...item,
        driveFileId: file.id,
        driveFileName: file.name,
        driveWebViewLink: file.web_view_link,
        driveMimeType: file.mime_type,
        driveFileSize: file.size,
        driveUploadedAt: file.uploaded_at,
      } : item));
      setDriveState("connected");
      setDriveFile(null);
      announce("Vídeo enviado para o seu Google Drive.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível enviar o vídeo.";
      setDriveState(message.includes("Conecte") || message.includes("expirou") ? "disconnected" : "error");
      setDriveError(message);
    }
  }

  async function disconnectInstagram() {
    if (!window.confirm("Desconectar esta conta do Instagram? Os conteúdos do MAPA não serão apagados.")) return;
    try {
      await invokeInstagram<{ connected: false }>({ action: "disconnect" });
      setInstagramState("disconnected");
      setInstagramAccount(null);
      setInstagramMetrics(null);
      setInstagramOpen(false);
      announce("Instagram desconectado.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Não foi possível desconectar o Instagram.");
    }
  }

  function disableInstagramDemo() {
    window.localStorage.removeItem(instagramDemoKey);
    setInstagramDemo(false);
    announce("Demonstração encerrada. O painel voltou a zero.");
  }

  async function resetWorkspace() {
    const target = user ? "na sua conta" : "neste navegador";
    if (!window.confirm(`Apagar todos os conteúdos salvos ${target}?`)) return;
    if (supabase && user) {
      const { error } = await supabase.from("content_items").delete().eq("user_id", user.id);
      if (error) {
        announce("Não foi possível zerar seu espaço. Tente novamente.");
        return;
      }
    }
    setContents([]);
    setSelectedId(null);
    setSearch("");
    window.localStorage.removeItem(storageKey);
    setUtilityModal(null);
    announce("Espaço zerado com sucesso.");
  }

  async function createFromInsight() {
    const item: ContentItem = {
      id: crypto.randomUUID(),
      title: "O que a balança não está mostrando?",
      format: "Reel",
      pillar: "Topo de funil",
      status: "Roteiro",
      date: todayIso,
      duration: "60s",
      hook: "O que a balança não está mostrando sobre o seu progresso?",
      script: "",
      cta: "",
      notes: "Ideia criada a partir de um insight do painel de demonstração.",
      driveFileId: null,
      driveFileName: null,
      driveWebViewLink: null,
      driveMimeType: null,
      driveFileSize: null,
      driveUploadedAt: null,
    };
    setContents((items) => [...items, item]);
    setSelectedId(item.id);
    setView("roteiros");
    if (supabase && user) {
      const { error } = await supabase.from("content_items").insert(contentToRow(item, user.id));
      if (error) {
        setContents((items) => items.filter((content) => content.id !== item.id));
        setSelectedId(null);
        announce("Não foi possível salvar esse insight como roteiro.");
        return;
      }
    }
    announce("Roteiro criado a partir do insight.");
  }

  async function saveSelected() {
    if (!selected) return;
    if (supabase && user) {
      window.clearTimeout(saveTimersRef.current[selected.id]);
      const row = contentToRow(selected, user.id);
      const { error } = await supabase
        .from("content_items")
        .update({
          title: row.title,
          format: row.format,
          pillar: row.pillar,
          status: row.status,
          scheduled_date: row.scheduled_date,
          duration: row.duration,
          hook: row.hook,
          script: row.script,
          cta: row.cta,
          notes: row.notes,
        })
        .eq("id", selected.id)
        .eq("user_id", user.id);
      announce(error ? "Não foi possível salvar o roteiro." : "Roteiro salvo na nuvem.");
      return;
    }
    announce("Roteiro salvo neste dispositivo.");
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      announce("Não foi possível sair agora. Tente novamente.");
      return;
    }
    setUtilityModal(null);
  }

  const titles: Record<View, { eyebrow: string; title: string; subtitle: string }> = {
    hoje: {
      eyebrow: formatTodayHeading(todayIso),
      title: contents.length ? `Bom dia, ${firstName}.` : "Seu MAPA começa aqui.",
      subtitle: contents.length
        ? "Vamos transformar as próximas ideias em publicações?"
        : "O espaço está zerado. Adicione sua primeira ideia para começar.",
    },
    calendario: {
      eyebrow: "PLANEJAMENTO EDITORIAL",
      title: "Calendário de produção",
      subtitle: "Visualize gravações, edições e publicações em um só lugar.",
    },
    roteiros: {
      eyebrow: "ESTÚDIO DE CRIAÇÃO",
      title: "Roteiros",
      subtitle: "Da primeira frase ao CTA, sem perder nenhuma boa ideia.",
    },
    desempenho: {
      eyebrow: "ANÁLISE DE CONTEÚDO",
      title: "Desempenho",
      subtitle: "Entenda o que funcionou e transforme métricas em próximas pautas.",
    },
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><span>M</span></div>
          <div className="brand-copy">
            <strong>MAPA</strong>
            <small>conteúdo em movimento</small>
          </div>
          <button
            className="icon-button sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expandir espaço de trabalho" : "Recolher espaço de trabalho"}
            title={sidebarCollapsed ? "Expandir espaço de trabalho" : "Recolher espaço de trabalho"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="icon-button mobile-close" aria-label="Fechar menu" onClick={() => setMobileMenu(false)}><X size={20} /></button>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          <p className="nav-label">ESPAÇO DE TRABALHO</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-item active" : "nav-item"}
                onClick={() => { setView(item.id); setMobileMenu(false); }}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.id === "roteiros" && <em>{contents.filter((content) => content.status === "Roteiro").length}</em>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="weekly-goal">
          <div className="goal-head"><span><Target size={16} /> Meta da semana</span><strong>{weeklyGoal}/5</strong></div>
          <div className="progress-track"><span style={{ width: `${weeklyGoal * 20}%` }} /></div>
          <small>{weeklyGoal ? `${5 - weeklyGoal} conteúdos para fechar a meta` : "Publique o primeiro conteúdo"}</small>
        </div>
        <button className="nav-item quiet" onClick={() => setUtilityModal("help")}><CircleHelp size={19} /><span>Central de ajuda</span></button>
        <button className="profile-button" onClick={() => setUtilityModal("profile")}>
          <span className="avatar">{initials}</span>
          <span><strong>{displayName}</strong><small>{user ? "Sincronizado" : "Meu espaço"}</small></span>
          <MoreHorizontal size={18} />
        </button>
      </aside>

      {mobileMenu && <button className="backdrop nav-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenu(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
          <div className="search-box">
            <Search size={18} />
            <input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conteúdo, tema ou formato..." aria-label="Buscar conteúdo" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <button className="icon-button notification" aria-label="Notificações" onClick={() => setUtilityModal("notifications")}><Bell size={20} /></button>
            <button className="button primary" onClick={() => openAdd()}><Plus size={18} /> Novo conteúdo</button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <span className="eyebrow">{titles[view].eyebrow}</span>
              <h1>{titles[view].title}</h1>
              <p>{titles[view].subtitle}</p>
            </div>
            {view === "desempenho" && (
              <button className={`button ${instagramState === "connected" || instagramDemo ? "connected" : "secondary"}`} onClick={() => setInstagramOpen(true)}>
                <Instagram size={18} /> {instagramState === "connected" && instagramAccount
                  ? `@${instagramAccount.username}`
                  : instagramDemo
                    ? "Instagram demonstrativo"
                    : "Configurar Instagram"}
              </button>
            )}
          </section>

          {view === "hoje" && (
            <TodayView
              contents={filteredContents}
              published={published}
              scheduled={scheduled}
              inProgress={inProgress}
              onView={setView}
              onSelect={(id) => { setSelectedId(id); setView("roteiros"); }}
              onStatusChange={changeStatus}
              onAdd={() => openAdd()}
            />
          )}
          {view === "calendario" && <CalendarView contents={filteredContents} onAdd={openAdd} onMove={(id, date) => void moveContentDate(id, date)} onSelect={(id) => { setSelectedId(id); setView("roteiros"); }} />}
          {view === "roteiros" && selected && (
            <ScriptsView
              contents={filteredContents}
              selected={selected}
              onSelect={setSelectedId}
              onUpdate={updateSelected}
              onStatusChange={changeStatus}
              onDelete={(id) => void deleteContent(id)}
              onUploadVideo={openDriveUpload}
              onSave={() => void saveSelected()}
              onAdd={() => openAdd()}
            />
          )}
          {view === "roteiros" && !selected && <EmptyWorkspace onAdd={() => openAdd()} />}
          {view === "desempenho" && (
            <PerformanceView
              demo={instagramDemo}
              connectionState={instagramState}
              account={instagramAccount}
              metrics={instagramMetrics}
              metricsLoading={instagramMetricsLoading}
              period={instagramPeriod}
              onConnect={() => setInstagramOpen(true)}
              onPeriodChange={setInstagramPeriod}
              onRefresh={() => void loadInstagramMetrics(instagramPeriod)}
              onDisableDemo={disableInstagramDemo}
              onCreateFromInsight={createFromInsight}
              onNotify={announce}
            />
          )}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegação móvel">
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon size={20} /><span>{item.label}</span></button>;
        })}
      </nav>

      {addOpen && (
        <Modal onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={addContent}>
            <div className="modal-icon mint"><CalendarPlus size={22} /></div>
            <span className="eyebrow">NOVA PAUTA</span>
            <h2>Adicionar conteúdo</h2>
            <p>Registre a ideia agora. Você poderá completar o roteiro depois.</p>
            <label>Título ou ideia<input autoFocus value={newItem.title} onChange={(event) => setNewItem({ ...newItem, title: event.target.value })} placeholder="Ex.: 3 sinais de baixa ingestão proteica" /></label>
            <div className="form-grid">
              <label>Formato<select value={newItem.format} onChange={(event) => setNewItem({ ...newItem, format: event.target.value as ContentItem["format"] })}><option>Reel</option><option>Carrossel</option><option>Stories</option><option>YouTube</option></select></label>
              <label>Etapa<select value={newItem.status} onChange={(event) => setNewItem({ ...newItem, status: event.target.value as Status })}>{statusOrder.map((status) => <option key={status}>{status}</option>)}</select></label>
            </div>
            <div className="form-grid">
              <label>Etapa de funil<select value={newItem.pillar} onChange={(event) => setNewItem({ ...newItem, pillar: event.target.value as FunnelStage })}>{funnelStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
              <label>Data<input type="date" value={newItem.date} onChange={(event) => setNewItem({ ...newItem, date: event.target.value })} /></label>
            </div>
            <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setAddOpen(false)}>Cancelar</button><button className="button primary" type="submit"><Plus size={18} /> Adicionar ao MAPA</button></div>
          </form>
        </Modal>
      )}

      {instagramOpen && (
        <Modal onClose={() => setInstagramOpen(false)} wide>
          <div className="instagram-modal">
            <div className="modal-icon instagram"><Instagram size={24} /></div>
            <span className="eyebrow">INTEGRAÇÃO OFICIAL</span>
            <h2>{instagramState === "connected" && instagramAccount
              ? `@${instagramAccount.username} está conectado`
              : "Conectar Instagram Profissional"}</h2>
            <p>{instagramState === "connected"
              ? "O MAPA pode importar as métricas autorizadas dessa conta. Sua senha nunca passa pelo aplicativo."
              : "O MAPA importará seus conteúdos e transformará alcance, visualizações e engajamento em decisões para a próxima pauta."}</p>
            <div className="connection-steps">
              <div><span>1</span><p><strong>Conta profissional</strong><small>O perfil precisa ser Criador ou Empresa.</small></p><Check size={18} /></div>
              <div><span>2</span><p><strong>Autorização segura</strong><small>O login acontece pela Meta. Sua senha não passa pelo MAPA.</small></p><Link2 size={18} /></div>
              <div><span>3</span><p><strong>Sincronização de insights</strong><small>O painel organiza as métricas disponíveis pela API oficial.</small></p><BarChart3 size={18} /></div>
            </div>
            {instagramError && <div className="info-note integration-feedback"><Lightbulb size={19} /><p><strong>Atenção:</strong> {instagramError}</p></div>}
            <div className="info-note"><LockKeyhole size={19} /><p><strong>Privacidade:</strong> o token de acesso é criptografado e fica somente no servidor. O MAPA solicita apenas perfil, conteúdos e insights.</p></div>
            <div className="modal-actions stacked-mobile instagram-actions">
              {instagramState === "connected"
                ? <>
                    <button className="button ghost danger" onClick={() => void disconnectInstagram()}>Desconectar</button>
                    <button className="button primary" onClick={() => { setInstagramOpen(false); setView("desempenho"); }}><BarChart3 size={18} /> Ver métricas</button>
                  </>
                : <>
                    <button className="button ghost" onClick={enableInstagramDemo}>Explorar demonstração</button>
                    <button className="button instagram-button" disabled={instagramState === "connecting" || instagramState === "checking"} onClick={() => void connectInstagram()}>
                      {instagramState === "connecting" || instagramState === "checking"
                        ? <><LoaderCircle className="spin" size={18} /> Preparando...</>
                        : <><Instagram size={18} /> Entrar com Instagram</>}
                    </button>
                  </>}
            </div>
          </div>
        </Modal>
      )}

      {driveModalContent && (
        <Modal onClose={() => {
          if (driveState === "uploading") return;
          setDriveModalContentId(null);
          setDriveFile(null);
          setDriveUploadProgress(0);
          setDriveError("");
        }} wide>
          <div className="drive-modal">
            <div className="modal-icon drive"><FolderOpen size={24} /></div>
            <span className="eyebrow">VÍDEO DA EDIÇÃO</span>
            <h2>Subir vídeo no Google Drive</h2>
            <p>O arquivo será enviado para uma pasta “MAPA Conteúdos” dentro da conta Google conectada por este usuário.</p>

            {driveState === "checking" && (
              <div className="integration-loading drive-loading"><LoaderCircle className="spin" size={25} /><strong>Verificando sua conta Google...</strong></div>
            )}

            {driveStatus?.connected && driveState !== "checking" ? (
              <form className="drive-upload-form" onSubmit={uploadDriveVideo}>
                <div className="drive-account">
                  <span className="drive-account-icon"><FolderOpen size={20} /></span>
                  <span><strong>{driveStatus.account?.name || "Google Drive conectado"}</strong><small>{driveStatus.account?.email}</small></span>
                  {driveStatus.folder && <a href={driveStatus.folder.url} target="_blank" rel="noreferrer">Abrir pasta <ExternalLink size={14} /></a>}
                </div>

                {driveModalContent.driveWebViewLink && (
                  <a className="drive-current-file" href={driveModalContent.driveWebViewLink} target="_blank" rel="noreferrer">
                    <Video size={20} />
                    <span><strong>Vídeo atual</strong><small>{driveModalContent.driveFileName}{driveModalContent.driveFileSize ? ` · ${formatFileSize(driveModalContent.driveFileSize)}` : ""}</small></span>
                    <ExternalLink size={16} />
                  </a>
                )}

                <label className={`video-upload-zone ${driveFile ? "has-file" : ""}`}>
                  <input
                    type="file"
                    accept="video/*"
                    disabled={driveState === "uploading"}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setDriveFile(file);
                      setDriveUploadProgress(0);
                      setDriveError("");
                    }}
                  />
                  <CloudUpload size={28} />
                  {driveFile
                    ? <span><strong>{driveFile.name}</strong><small>{formatFileSize(driveFile.size)} · clique para trocar</small></span>
                    : <span><strong>Escolher vídeo</strong><small>Selecione o arquivo que será enviado ao seu Drive</small></span>}
                </label>

                {driveState === "uploading" && (
                  <div className="upload-progress" aria-live="polite">
                    <div><span>Enviando diretamente ao Google Drive</span><strong>{driveUploadProgress}%</strong></div>
                    <span><i style={{ width: `${driveUploadProgress}%` }} /></span>
                  </div>
                )}
                {driveError && <div className="info-note integration-feedback"><Lightbulb size={19} /><p><strong>Atenção:</strong> {driveError}</p></div>}
                <div className="modal-actions stacked-mobile">
                  <button type="button" className="button ghost danger" disabled={driveState === "uploading"} onClick={() => void disconnectGoogleDrive()}>Desconectar Drive</button>
                  <button type="submit" className="button drive-button" disabled={!driveFile || driveState === "uploading"}>
                    {driveState === "uploading"
                      ? <><LoaderCircle className="spin" size={18} /> Enviando {driveUploadProgress}%</>
                      : <><CloudUpload size={18} /> Enviar vídeo ao Drive</>}
                  </button>
                </div>
              </form>
            ) : driveState !== "checking" && (
              <>
                <div className="connection-steps drive-steps">
                  <div><span>1</span><p><strong>Uma conta por usuário</strong><small>Cada pessoa escolhe e autoriza o próprio Google Drive.</small></p><Users size={18} /></div>
                  <div><span>2</span><p><strong>Login feito pelo Google</strong><small>A senha Google nunca passa pelo MAPA.</small></p><LockKeyhole size={18} /></div>
                  <div><span>3</span><p><strong>Pasta organizada</strong><small>Os vídeos ficam na pasta “MAPA Conteúdos”.</small></p><FolderOpen size={18} /></div>
                </div>
                {driveError && <div className="info-note integration-feedback"><Lightbulb size={19} /><p><strong>Atenção:</strong> {driveError}</p></div>}
                <div className="modal-actions">
                  <button type="button" className="button drive-button" disabled={driveState === "connecting"} onClick={() => void connectGoogleDrive(driveModalContent.id)}>
                    {driveState === "connecting"
                      ? <><LoaderCircle className="spin" size={18} /> Abrindo Google...</>
                      : <><FolderOpen size={18} /> Conectar meu Google Drive</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {utilityModal === "notifications" && (
        <Modal onClose={() => setUtilityModal(null)}>
          <div className="utility-modal">
            <div className="modal-icon mint"><Bell size={22} /></div>
            <span className="eyebrow">NOTIFICAÇÕES</span>
            <h2>Tudo em dia</h2>
            <p>Você não tem notificações novas. Avisos de gravação e publicação aparecerão aqui.</p>
            <div className="utility-empty"><CheckCircle2 size={24} /><strong>Nenhuma pendência</strong><small>Quando houver uma ação programada, o MAPA avisará você.</small></div>
            <div className="modal-actions"><button className="button primary" onClick={() => setUtilityModal(null)}>Entendi</button></div>
          </div>
        </Modal>
      )}

      {utilityModal === "help" && (
        <Modal onClose={() => setUtilityModal(null)} wide>
          <div className="utility-modal">
            <div className="modal-icon mint"><MessageCircle size={22} /></div>
            <span className="eyebrow">CENTRAL DE AJUDA</span>
            <h2>Comece em três passos</h2>
            <p>O fluxo foi pensado para você sair da ideia e chegar à publicação sem perder contexto.</p>
            <div className="help-steps">
              <div><span>1</span><p><strong>Registre a ideia</strong><small>Use “Novo conteúdo” assim que surgir uma pauta.</small></p></div>
              <div><span>2</span><p><strong>Escreva o roteiro</strong><small>Preencha gancho, desenvolvimento, CTA e direção visual.</small></p></div>
              <div><span>3</span><p><strong>Mova pelo fluxo</strong><small>Arraste o cartão até gravação, edição e agendamento.</small></p></div>
            </div>
            <div className="modal-actions"><button className="button ghost" onClick={() => setUtilityModal(null)}>Fechar</button><button className="button primary" onClick={() => { setUtilityModal(null); openAdd(); }}><Plus size={18} /> Criar conteúdo</button></div>
          </div>
        </Modal>
      )}

      {utilityModal === "profile" && (
        <Modal onClose={() => setUtilityModal(null)}>
          <div className="utility-modal">
            <div className="profile-modal-head"><span className="avatar large">{initials}</span><span><span className="eyebrow">MEU ESPAÇO</span><h2>{displayName}</h2><p>{user?.email || "Dados salvos neste navegador"}</p></span></div>
            <div className="workspace-summary"><Settings2 size={20} /><span><strong>{contents.length} conteúdos cadastrados</strong><small>{user ? "Seus dados ficam sincronizados e protegidos por usuário." : "O MAPA mantém apenas o que você adicionar neste dispositivo."}</small></span></div>
            <div className="modal-actions profile-actions"><button className="button ghost danger" onClick={() => void resetWorkspace()}>Zerar meu espaço</button>{user && <button className="button ghost" onClick={() => void signOut()}><LogOut size={17} /> Sair</button>}<button className="button primary" onClick={() => setUtilityModal(null)}>Concluir</button></div>
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role="status"><CheckCircle2 size={19} />{toast}</div>}
    </div>
  );
}

function AppLoading() {
  return (
    <main className="auth-shell auth-loading" aria-busy="true">
      <div className="auth-brand"><span className="brand-mark"><span>M</span></span><strong>MAPA</strong></div>
      <LoaderCircle className="spin" size={28} />
      <p>Preparando seu espaço de criação...</p>
    </main>
  );
}

type AuthMode = "login" | "signup" | "forgot" | "reset";

function AuthScreen({
  initialMode = "login",
  onRecoveryComplete,
}: {
  initialMode?: AuthMode;
  onRecoveryComplete?: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setFeedback(null);
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || submitting) return;

    const cleanEmail = email.trim().toLowerCase();

    if (mode === "forgot") {
      if (!cleanEmail) {
        setFeedback({ tone: "error", text: "Informe o e-mail usado na sua conta." });
        return;
      }
      setSubmitting(true);
      setFeedback(null);
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/?auth=recovery`,
      });
      setFeedback(error
        ? { tone: "error", text: "Não foi possível enviar o link agora. Tente novamente em alguns minutos." }
        : { tone: "success", text: "Enviamos um link de recuperação. Confira sua caixa de entrada e o spam." });
      setSubmitting(false);
      return;
    }

    if (mode === "reset") {
      if (password.length < 8) {
        setFeedback({ tone: "error", text: "A nova senha precisa ter pelo menos 8 caracteres." });
        return;
      }
      if (password !== passwordConfirmation) {
        setFeedback({ tone: "error", text: "As senhas não são iguais." });
        return;
      }
      setSubmitting(true);
      setFeedback(null);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFeedback({ tone: "error", text: "O link expirou ou não foi reconhecido. Solicite uma nova recuperação." });
      } else {
        window.history.replaceState({}, "", window.location.pathname);
        setFeedback({ tone: "success", text: "Senha atualizada. Seu espaço já está liberado." });
        window.setTimeout(() => onRecoveryComplete?.(), 900);
      }
      setSubmitting(false);
      return;
    }

    if (!cleanEmail || password.length < 8) {
      setFeedback({ tone: "error", text: "Use um e-mail válido e uma senha com pelo menos 8 caracteres." });
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setFeedback({ tone: "error", text: "Informe seu nome para criar a conta." });
      return;
    }
    if (mode === "signup" && password !== passwordConfirmation) {
      setFeedback({ tone: "error", text: "As senhas não são iguais." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) {
        setFeedback({ tone: "error", text: "E-mail ou senha incorretos. Verifique os dados e tente novamente." });
      }
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (error) {
      setFeedback({ tone: "error", text: error.message.includes("already") ? "Este e-mail já possui uma conta." : "Não foi possível criar a conta. Tente novamente." });
    } else if (!data.session) {
      setFeedback({ tone: "success", text: "Conta criada. Confira seu e-mail para confirmar o acesso." });
    }
    setSubmitting(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand"><span className="brand-mark"><span>M</span></span><span><strong>MAPA</strong><small>conteúdo em movimento</small></span></div>
        <div className="auth-copy">
          <span className="eyebrow">SEU SISTEMA DE PRODUÇÃO</span>
          <h1>Da ideia à publicação, tudo no lugar.</h1>
          <p>Planeje o calendário, escreva roteiros e acompanhe cada conteúdo com um espaço seguro e sincronizado.</p>
          <div className="auth-benefits">
            <span><CalendarDays size={19} /><strong>Calendário editorial</strong></span>
            <span><FileText size={19} /><strong>Estúdio de roteiros</strong></span>
            <span><LockKeyhole size={19} /><strong>Dados separados por usuário</strong></span>
          </div>
        </div>
        <small className="auth-footnote">MAPA · produtividade para criação de conteúdo</small>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand"><span className="brand-mark"><span>M</span></span><strong>MAPA</strong></div>
          <span className="eyebrow">BEM-VINDO AO MAPA</span>
          <h2>{mode === "login"
            ? "Entre no seu espaço"
            : mode === "signup"
              ? "Crie sua conta"
              : mode === "forgot"
                ? "Recupere sua senha"
                : "Crie uma nova senha"}</h2>
          <p>{mode === "login"
            ? "Use seu e-mail e senha para continuar de onde parou."
            : mode === "signup"
              ? "Seu espaço começa zerado e será sincronizado com segurança."
              : mode === "forgot"
                ? "Digite seu e-mail para receber um link seguro de recuperação."
                : "Escolha uma nova senha para voltar ao seu espaço."}</p>

          {mode !== "reset" && <div className="auth-tabs" aria-label="Tipo de acesso">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}><LogIn size={17} /> Entrar</button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")}><UserPlus size={17} /> Criar conta</button>
          </div>}

          <form className="auth-form" onSubmit={submitAuth}>
            {mode === "signup" && <label>Seu nome<div className="auth-input"><UserPlus size={18} /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos chamar você?" /></div></label>}
            {mode !== "reset" && <label>E-mail<div className="auth-input"><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" /></div></label>}
            {mode !== "forgot" && <label>{mode === "reset" ? "Nova senha" : "Senha"}<div className="auth-input"><LockKeyhole size={18} /><input type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" /></div></label>}
            {(mode === "signup" || mode === "reset") && <label>Confirme a senha<div className="auth-input"><LockKeyhole size={18} /><input type="password" minLength={8} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="Digite a senha novamente" /></div></label>}
            {mode === "login" && <button type="button" className="auth-recovery-link" onClick={() => changeMode("forgot")}>Esqueci minha senha</button>}
            {feedback && <div className={`auth-feedback ${feedback.tone}`} role="status">{feedback.tone === "success" ? <CheckCircle2 size={18} /> : <CircleHelp size={18} />}<span>{feedback.text}</span></div>}
            <button className="button primary auth-submit" type="submit" disabled={submitting}>{submitting
              ? <LoaderCircle className="spin" size={19} />
              : mode === "login"
                ? <LogIn size={19} />
                : mode === "signup"
                  ? <UserPlus size={19} />
                  : <LockKeyhole size={19} />}{submitting
              ? "Aguarde..."
              : mode === "login"
                ? "Entrar no MAPA"
                : mode === "signup"
                  ? "Criar meu espaço"
                  : mode === "forgot"
                    ? "Enviar link de recuperação"
                    : "Salvar nova senha"}</button>
            {mode === "forgot" && <button type="button" className="auth-back-link" onClick={() => changeMode("login")}><ChevronLeft size={16} /> Voltar para o login</button>}
          </form>
          <small className="auth-privacy">Sua senha é processada pelo Supabase Auth e não fica gravada no código do MAPA.</small>
        </div>
      </section>
    </main>
  );
}

function TodayView({
  contents,
  published,
  scheduled,
  inProgress,
  onView,
  onSelect,
  onStatusChange,
  onAdd,
}: {
  contents: ContentItem[];
  published: number;
  scheduled: number;
  inProgress: number;
  onView: (view: View) => void;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  onAdd: () => void;
}) {
  const todayItems = contents.filter((item) => item.date === todayIso);
  const boardStatuses: Status[] = ["Ideia", "Roteiro", "Gravação", "Edição", "Agendado"];
  const consistency = Math.min(100, Math.round((published / 5) * 100));
  const activeDays = Array.from({ length: 7 }, (_, index) => index < Math.min(published, 7));
  return (
    <>
      <section className="metrics-grid">
        <MetricCard icon={<Zap size={19} />} tone="lime" label="Em produção" value={String(inProgress)} detail={inProgress ? "Roteiro, gravação ou edição" : "Nenhum item em produção"} />
        <MetricCard icon={<CalendarDays size={19} />} tone="blue" label="Agendados" value={String(scheduled)} detail={scheduled ? "Prontos para publicar" : "Nada agendado"} />
        <MetricCard icon={<CheckCircle2 size={19} />} tone="violet" label="Publicados" value={String(published)} detail="Neste mês" />
        <MetricCard icon={<Target size={19} />} tone="coral" label="Consistência" value={`${consistency}%`} detail={published ? `${published} de 5 na meta semanal` : "Comece com a primeira publicação"} positive={published > 0} />
      </section>

      <section className="dashboard-grid">
        <div className="panel today-panel">
          <PanelHeader eyebrow="PRÓXIMAS AÇÕES" title="Na sua mesa" action="Ver calendário" onAction={() => onView("calendario")} />
          <div className="today-list">
            {todayItems.map((item, index) => (
              <button key={item.id} className="today-item" onClick={() => onSelect(item.id)}>
                <span className={`time-dot ${index === 0 ? "active" : ""}`}><i />{index === 0 ? "10:00" : "16:30"}</span>
                <span className={`format-icon ${formatColors[item.format]}`}>{item.format === "Carrossel" ? <FileText size={19} /> : <Video size={19} />}</span>
                <span className="item-main"><strong>{item.title}</strong><small>{item.format} · {item.duration}</small></span>
                <span className={`status-pill status-${item.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}>{item.status}</span>
                <ChevronRight size={18} />
              </button>
            ))}
            {todayItems.length === 0 && <EmptyMini text="Nenhum item para hoje." />}
          </div>
        </div>

        <div className="panel momentum-panel">
          <div className="momentum-top"><span className="panel-icon"><TrendingUp size={19} /></span><span><small>RITMO DE PUBLICAÇÃO</small><strong>{contents.length ? "Ritmo em construção" : "Pronto para começar"}</strong></span></div>
          <div className="streak-row"><strong>{published}</strong><span>publicações<br />neste ciclo</span></div>
          <div className="week-dots">{activeDays.map((active, index) => <div key={weekDays[index]}><span className={active ? "done" : index === 1 ? "today" : ""}>{active ? <Check size={15} /> : weekDays[index].slice(0, 1)}</span><small>{weekDays[index]}</small></div>)}</div>
          <p>{contents.length ? "Continue movendo os conteúdos pelo fluxo para manter a cadência." : "Adicione uma ideia e o MAPA começará a acompanhar sua consistência."}</p>
          <button className="text-button" onClick={() => contents.length ? onView("desempenho") : onAdd()}>{contents.length ? "Ver análise completa" : "Criar primeiro conteúdo"} <ArrowUpRight size={16} /></button>
        </div>
      </section>

      <section className="panel pipeline-panel">
        <PanelHeader eyebrow="FLUXO DE PRODUÇÃO" title="Do rascunho à publicação" action="Adicionar ideia" onAction={onAdd} />
        <div className="kanban-board">
          {boardStatuses.map((status) => {
            const items = contents.filter((item) => item.status === status).slice(0, 2);
            return (
              <div className="kanban-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onStatusChange(event.dataTransfer.getData("text/plain"), status)}>
                <div className="column-head"><span className={`column-dot dot-${status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`} /> <strong>{status}</strong><em>{contents.filter((item) => item.status === status).length}</em></div>
                {items.map((item) => (
                  <article className="kanban-card" key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", String(item.id))} onClick={() => onSelect(item.id)}>
                    <div className="card-grip"><span className={`micro-tag ${formatColors[item.format]}`}>{item.format}</span><GripVertical size={16} /></div>
                    <h3>{item.title}</h3>
                    <div className="card-meta"><span><CalendarDays size={14} /> {formatShortDate(item.date)}</span><span>{item.pillar}</span></div>
                  </article>
                ))}
                {items.length === 0 && <button className="empty-drop" onClick={onAdd}><Plus size={16} /> Adicionar</button>}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function CalendarView({ contents, onAdd, onMove, onSelect }: { contents: ContentItem[]; onAdd: (date?: string) => void; onMove: (id: string, date: string) => void; onSelect: (id: string) => void }) {
  const referenceToday = new Date(`${todayIso}T12:00:00`);
  const [month, setMonth] = useState(new Date(referenceToday.getFullYear(), referenceToday.getMonth(), 1));
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"Todas" | Status>("Todas");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingSlots = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const totalSlots = Math.ceil((leadingSlots + daysInMonth) / 7) * 7;
  const slots = Array.from({ length: totalSlots }, (_, index) => {
    const day = index - leadingSlots + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const monthNameRaw = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(month);
  const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const monthContents = contents.filter((item) => item.date.startsWith(monthPrefix));
  const monthlyScripts = monthContents.filter((item) => item.status !== "Ideia" || item.script.trim()).length;
  const monthlyPublished = monthContents.filter((item) => item.status === "Publicado").length;
  const filteredByStatus = statusFilter === "Todas" ? contents : contents.filter((item) => item.status === statusFilter);

  function changeMonth(offset: number) {
    setMonth(new Date(year, monthIndex + offset, 1));
  }

  return (
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="month-switcher"><button className="icon-button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button><h2>{monthName} <span>{year}</span></h2><button className="icon-button" aria-label="Próximo mês" onClick={() => changeMonth(1)}><ChevronRight size={19} /></button></div>
        <div className="calendar-progress" aria-label="Progresso do mês">
          <div><span className="progress-icon scripts"><FileText size={17} /></span><span><strong>{monthlyScripts}</strong><small>roteiros no mês</small></span></div>
          <div><span className="progress-icon published"><CheckCircle2 size={17} /></span><span><strong>{monthlyPublished}</strong><small>vídeos publicados</small></span></div>
        </div>
        <div className="toolbar-actions">
          <div className="filter-wrap">
            <button className="button ghost small" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}><Filter size={16} /> {statusFilter === "Todas" ? "Filtrar fase" : statusFilter}</button>
            {filterOpen && <div className="filter-menu">{(["Todas", ...statusOrder] as const).map((status) => <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => { setStatusFilter(status); setFilterOpen(false); }}>{statusFilter === status && <Check size={14} />}{status}</button>)}</div>}
          </div>
          <button className="button secondary small" onClick={() => setMonth(new Date(referenceToday.getFullYear(), referenceToday.getMonth(), 1))}>Hoje</button>
          <button className="button primary small" onClick={() => onAdd()}><Plus size={16} /> Adicionar</button>
        </div>
      </div>
      <div className="calendar-grid calendar-weekdays">{weekDays.map((day) => <div key={day}>{day}</div>)}</div>
      <div className="calendar-grid month-grid">
        {slots.map((day, index) => {
          if (!day) return <div className="day-cell outside" key={`blank-${index}`} />;
          const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayItems = filteredByStatus.filter((item) => item.date === date);
          return (
            <div
              className={`day-cell ${date === todayIso ? "current-day" : ""} ${dropDate === date ? "drop-target" : ""}`}
              key={date}
              onDoubleClick={() => onAdd(date)}
              onDragEnter={(event) => {
                event.preventDefault();
                if (draggedId) setDropDate(date);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (draggedId && dropDate !== date) setDropDate(date);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropDate(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const itemId = event.dataTransfer.getData("text/plain") || draggedId;
                setDropDate(null);
                setDraggedId(null);
                if (itemId) onMove(itemId, date);
              }}
            >
              <div className="day-number"><span>{day}</span>{dayItems.length > 0 && <button aria-label={`Adicionar em ${day} de ${monthName}`} onClick={() => onAdd(date)}><Plus size={13} /></button>}</div>
              <div className="day-items">
                {dayItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    className={`calendar-item status-${item.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")} ${draggedId === item.id ? "dragging" : ""}`}
                    draggable
                    aria-grabbed={draggedId === item.id}
                    title={`${item.status}: arraste para outro dia ou clique para abrir`}
                    onClick={() => onSelect(item.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.id);
                      setDraggedId(item.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropDate(null);
                    }}
                  ><span className="calendar-phase-number">{statusOrder.indexOf(item.status) + 1}</span><strong>{item.title}</strong></button>
                ))}
              </div>
              {dayItems.length === 0 && <button className="day-add" aria-label={`Adicionar conteúdo em ${day} de ${monthName}`} onClick={() => onAdd(date)}><Plus size={14} /></button>}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend">{statusOrder.map((status) => <span key={status}><i className={`status-${status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`} /> {status}</span>)}<small>As cores mostram a fase. Arraste um conteúdo para mudar o dia.</small></div>
    </section>
  );
}

function ScriptsView({ contents, selected, onSelect, onUpdate, onStatusChange, onDelete, onUploadVideo, onSave, onAdd }: { contents: ContentItem[]; selected: ContentItem; onSelect: (id: string) => void; onUpdate: (field: keyof ContentItem, value: string) => void; onStatusChange: (id: string, status: Status) => void; onDelete: (id: string) => void; onUploadVideo: (id: string) => void; onSave: () => void; onAdd: () => void }) {
  const [libraryFilter, setLibraryFilter] = useState<"Todos" | "Em roteiro" | "Prontos">("Todos");
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const closeTeleprompter = useCallback(() => setTeleprompterOpen(false), []);
  const scriptDocument = useMemo(() => parseScriptDocument(selected), [selected]);
  const currentStatusIndex = statusOrder.indexOf(selected.status);
  const nextStatus = statusOrder[currentStatusIndex + 1];
  const visibleContents = contents.filter((item) => {
    if (libraryFilter === "Em roteiro") return item.status === "Roteiro";
    if (libraryFilter === "Prontos") return ["Agendado", "Publicado"].includes(item.status);
    return true;
  });
  const totalWords = scriptBlockDefinitions.reduce((total, definition) => {
    const text = richTextToPlainText(scriptDocument.blocks[definition.id].html);
    return total + (text ? text.split(/\s+/).length : 0);
  }, 0);
  const teleprompterSections = scriptBlockDefinitions
    .filter((definition) => definition.id !== "caption")
    .map((definition) => ({
      id: definition.id,
      title: definition.title,
      text: richTextToPlainText(scriptDocument.blocks[definition.id].html).trim(),
    }))
    .filter((section) => section.text);

  function updateBlock(id: ScriptBlockId, patch: Partial<ScriptBlock>) {
    const nextDocument: ScriptDocument = {
      ...scriptDocument,
      blocks: {
        ...scriptDocument.blocks,
        [id]: { ...scriptDocument.blocks[id], ...patch },
      },
    };
    onUpdate("script", JSON.stringify(nextDocument));
  }

  return (
    <section className={`scripts-layout ${libraryCollapsed ? "library-is-collapsed" : ""}`}>
      <aside className={`panel script-library ${libraryCollapsed ? "library-collapsed" : ""}`}>
        {libraryCollapsed ? (
          <div className="library-collapsed-rail">
            <button className="icon-button" aria-label="Mostrar Seus conteúdos" title="Mostrar Seus conteúdos" onClick={() => setLibraryCollapsed(false)}><PanelLeftOpen size={19} /></button>
            <span>CONTEÚDOS</span>
            <button className="icon-button dark" aria-label="Novo roteiro" title="Novo roteiro" onClick={onAdd}><Plus size={18} /></button>
          </div>
        ) : (
          <>
            <div className="library-head">
              <div><span className="eyebrow">BIBLIOTECA</span><h2>Seus conteúdos</h2></div>
              <div className="library-head-actions">
                <button className="icon-button" aria-label="Ocultar Seus conteúdos" title="Ocultar Seus conteúdos" onClick={() => setLibraryCollapsed(true)}><PanelLeftClose size={18} /></button>
                <button className="icon-button dark" aria-label="Novo roteiro" title="Novo roteiro" onClick={onAdd}><Plus size={18} /></button>
              </div>
            </div>
            <div className="library-filters">
              {(["Todos", "Em roteiro", "Prontos"] as const).map((filter) => <button key={filter} className={libraryFilter === filter ? "active" : ""} onClick={() => setLibraryFilter(filter)}>{filter}{filter === "Todos" && <span>{contents.length}</span>}</button>)}
            </div>
            <div className="library-list">
              {visibleContents.map((item) => (
                <button key={item.id} className={item.id === selected.id ? "library-item selected" : "library-item"} onClick={() => onSelect(item.id)}>
                  <span className={`format-icon mini ${formatColors[item.format]}`}>{item.format === "Reel" ? <Play size={15} /> : <FileText size={15} />}</span>
                  <span><strong>{item.title}</strong><small>{item.format} · Fase: {item.status}</small></span>
                  <ChevronRight size={16} />
                </button>
              ))}
              {visibleContents.length === 0 && <div className="library-empty"><FileText size={22} /><strong>Nenhum conteúdo aqui</strong><small>Escolha outro filtro ou adicione uma nova pauta.</small></div>}
            </div>
          </>
        )}
      </aside>

      <article className="panel editor-panel structured-editor">
        <div className="editor-toolbar">
          <div className="editor-title"><span className={`micro-tag ${formatColors[selected.format]}`}>{selected.format}</span><span className={`status-pill status-${selected.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}>{selected.status}</span></div>
          <div>
            <span className="saved-state"><Check size={15} /> Salvo automaticamente</span>
            {selected.status === "Gravação" && <button type="button" className="button teleprompter-button small" onClick={() => setTeleprompterOpen(true)}>
              <Video size={16} /> Abrir teleprompter
            </button>}
            {selected.status === "Edição" && <button type="button" className={`button small ${selected.driveFileId ? "drive-linked" : "drive-button"}`} onClick={() => onUploadVideo(selected.id)}>
              {selected.driveFileId ? <><FolderOpen size={16} /> Vídeo no Drive</> : <><CloudUpload size={16} /> Subir vídeo</>}
            </button>}
            <button type="button" className="button danger small" onClick={() => onDelete(selected.id)}><Trash2 size={16} /> Excluir</button>
            {nextStatus && <button type="button" className="button phase-next small" onClick={() => onStatusChange(selected.id, nextStatus)}>
              {selected.status === "Ideia" ? <><Sparkles size={16} /> Transformar em conteúdo</> : <>Avançar para {nextStatus} <ChevronRight size={16} /></>}
            </button>}
            <button className="button primary small" onClick={onSave}><Save size={16} /> Salvar</button>
          </div>
        </div>
        <div className="phase-tracker" aria-label="Fase atual da criação do conteúdo">
          <span className="phase-tracker-label">FASE DO CONTEÚDO</span>
          <div className="phase-steps">
            {statusOrder.map((status, index) => (
              <button
                type="button"
                key={status}
                className={`${index < currentStatusIndex ? "complete" : ""} ${status === selected.status ? "current" : ""}`}
                aria-pressed={status === selected.status}
                onClick={() => onStatusChange(selected.id, status)}
              ><span>{index < currentStatusIndex ? <Check size={13} /> : index + 1}</span>{status}</button>
            ))}
          </div>
        </div>
        <div className="editor-scroll">
          <label className="title-input"><span>TÍTULO</span><input value={selected.title} onChange={(event) => onUpdate("title", event.target.value)} /></label>
          <div className="brief-row"><span><CalendarDays size={15} /> {formatShortDate(selected.date)}</span><span><Clock3 size={15} /> {selected.duration}</span><span><Target size={15} /> Etapa: {selected.pillar}</span></div>
          <div className="script-document-summary">
            <div><Sparkles size={19} /><span><strong>Roteiro magnético em 10 blocos</strong><small>Escreva, formate e acrescente notas em cada etapa.</small></span></div>
            <span>{totalWords} palavras · aprox. {Math.max(0, Math.ceil(totalWords / 2.2))} segundos</span>
          </div>

          <div className="script-blocks">
            {scriptBlockDefinitions.map((definition) => {
              const block = scriptDocument.blocks[definition.id];
              return (
                <RichTextScriptBlock
                  key={`${selected.id}:${definition.id}`}
                  definition={definition}
                  block={block}
                  onChange={(patch) => updateBlock(definition.id, patch)}
                />
              );
            })}
          </div>
        </div>
      </article>
      {teleprompterOpen && (
        <Teleprompter
          title={selected.title}
          sections={teleprompterSections}
          onClose={closeTeleprompter}
        />
      )}
    </section>
  );
}

function Teleprompter({ title, sections, onClose }: { title: string; sections: { id: string; title: string; text: string }[]; onClose: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(34);
  const [fontSize, setFontSize] = useState(54);
  const [mirrored, setMirrored] = useState(false);
  const [progress, setProgress] = useState(0);

  const hasScript = sections.length > 0;

  const restart = useCallback(() => {
    const reader = readerRef.current;
    if (reader) reader.scrollTo({ top: 0, behavior: "smooth" });
    progressRef.current = 0;
    setProgress(0);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) {
      previousTimeRef.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }

    function tick(time: number) {
      const reader = readerRef.current;
      if (!reader) return;
      const previous = previousTimeRef.current ?? time;
      previousTimeRef.current = time;
      reader.scrollTop += speed * ((time - previous) / 1000);
      const maximum = Math.max(0, reader.scrollHeight - reader.clientHeight);
      const nextProgress = maximum ? Math.min(100, (reader.scrollTop / maximum) * 100) : 100;
      const roundedProgress = Math.round(nextProgress);
      if (roundedProgress !== progressRef.current) {
        progressRef.current = roundedProgress;
        setProgress(roundedProgress);
      }
      if (maximum > 0 && reader.scrollTop >= maximum - 1) {
        setPlaying(false);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [playing, speed]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key === "ArrowUp") setSpeed((value) => Math.min(90, value + 4));
      if (event.key === "ArrowDown") setSpeed((value) => Math.max(10, value - 4));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch {
      // A interface já ocupa toda a janela quando o navegador bloqueia o modo imersivo.
    }
  }

  return (
    <div className="teleprompter-layer" role="dialog" aria-modal="true" aria-label={`Teleprompter de ${title}`} ref={shellRef}>
      <header className="teleprompter-header">
        <div className="teleprompter-title"><span><Video size={19} /></span><div><small>TELEPROMPTER · GRAVAÇÃO</small><strong>{title}</strong></div></div>
        <div className="teleprompter-progress" aria-label={`Progresso ${Math.round(progress)}%`}><span><i style={{ width: `${progress}%` }} /></span><em>{Math.round(progress)}%</em></div>
        <button className="teleprompter-close" type="button" onClick={onClose} aria-label="Fechar teleprompter"><X size={22} /></button>
      </header>

      <main className={`teleprompter-reader ${mirrored ? "mirrored" : ""}`} ref={readerRef} onScroll={() => {
        const reader = readerRef.current;
        if (!reader) return;
        const maximum = Math.max(0, reader.scrollHeight - reader.clientHeight);
        const nextProgress = Math.round(maximum ? Math.min(100, (reader.scrollTop / maximum) * 100) : 0);
        if (nextProgress !== progressRef.current) {
          progressRef.current = nextProgress;
          setProgress(nextProgress);
        }
      }}>
        <div className="teleprompter-spacer" />
        {hasScript ? (
          <div className="teleprompter-copy" style={{ fontSize: `${fontSize}px` }}>
            {sections.map((section) => <p key={section.id}>{section.text}</p>)}
          </div>
        ) : (
          <div className="teleprompter-empty"><FileText size={32} /><strong>Este roteiro ainda está vazio</strong><p>Volte ao editor, preencha os blocos e abra o teleprompter novamente.</p></div>
        )}
        <div className="teleprompter-spacer end" />
      </main>

      <div className="teleprompter-focus-line" aria-hidden="true"><span /></div>
      <footer className="teleprompter-controls">
        <button type="button" className="teleprompter-secondary" onClick={restart}><RotateCcw size={18} /><span>Reiniciar</span></button>
        <label className="teleprompter-speed"><span>Velocidade</span><input type="range" min="10" max="90" step="2" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /><strong>{speed}</strong></label>
        <button type="button" className="teleprompter-play" disabled={!hasScript} onClick={() => setPlaying((value) => !value)}>{playing ? <><Pause size={23} /> Pausar</> : <><Play size={23} /> Iniciar</>}</button>
        <div className="teleprompter-font" aria-label="Tamanho da letra"><Type size={18} /><button type="button" onClick={() => setFontSize((value) => Math.max(30, value - 4))} aria-label="Diminuir letra"><Minus size={17} /></button><strong>{fontSize}</strong><button type="button" onClick={() => setFontSize((value) => Math.min(90, value + 4))} aria-label="Aumentar letra"><Plus size={17} /></button></div>
        <button type="button" className={`teleprompter-secondary ${mirrored ? "active" : ""}`} onClick={() => setMirrored((value) => !value)}><FlipHorizontal2 size={18} /><span>Espelhar</span></button>
        <button type="button" className="teleprompter-secondary" onClick={() => void toggleFullscreen()}><Maximize2 size={18} /><span>Tela cheia</span></button>
      </footer>
      <div className="teleprompter-shortcuts">Espaço: iniciar/pausar · ↑ ↓: velocidade · Esc: fechar</div>
    </div>
  );
}

function RichTextScriptBlock({ definition, block, onChange }: { definition: ScriptBlockDefinition; block: ScriptBlock; onChange: (patch: Partial<ScriptBlock>) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [noteOpen, setNoteOpen] = useState(Boolean(block.note));
  const safeHtml = useMemo(() => sanitizeRichTextHtml(block.html), [block.html]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || editor.innerHTML === safeHtml) return;
    editor.innerHTML = safeHtml;
  }, [safeHtml]);

  function commitEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    const html = sanitizeRichTextHtml(editor.innerHTML);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    if (html !== safeHtml) onChange({ html });
  }

  function toggleBold() {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement !== editor) editor.focus();
    document.execCommand("bold", false);
    commitEditor();
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      toggleBold();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const plainText = event.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, plainTextToRichHtml(plainText));
    commitEditor();
  }

  return (
    <section className={`script-block-card ${definition.id === "headline" ? "featured" : ""} ${definition.id === "caption" ? "caption-block" : ""}`}>
      <div className="script-block-header">
        <div className="script-block-identity">
          <span className="number-badge">{definition.number}</span>
          <span><strong>{definition.id === "caption" ? definition.title : `BLOCO ${definition.number} · ${definition.title}`}</strong><small>{definition.helper}</small></span>
        </div>
        <div className="script-block-tools" aria-label={`Formatação do bloco ${definition.number}`}>
          <button
            className="format-tool"
            aria-label="Aplicar ou remover negrito na seleção"
            title="Negrito na seleção (Ctrl/Cmd+B)"
            onClick={toggleBold}
            onMouseDown={(event) => event.preventDefault()}
          ><Bold size={16} /></button>
          <div className="font-colors" aria-label="Cor da fonte">
            <Palette size={16} />
            {scriptColorPresets.map((color) => (
              <button
                key={color}
                className={block.color.toLowerCase() === color.toLowerCase() ? "color-swatch active" : "color-swatch"}
                style={{ backgroundColor: color }}
                aria-label={`Usar cor ${color}`}
                title={`Cor ${color}`}
                onClick={() => onChange({ color })}
              />
            ))}
            <label className="custom-color" title="Escolher outra cor">
              <input type="color" value={block.color} aria-label="Escolher outra cor da fonte" onChange={(event) => onChange({ color: event.target.value })} />
            </label>
          </div>
          <button
            className={`format-tool note-tool ${noteOpen ? "active" : ""}`}
            aria-label={noteOpen ? "Ocultar nota do bloco" : "Adicionar nota ao bloco"}
            title={noteOpen ? "Ocultar nota" : "Adicionar nota"}
            onClick={() => setNoteOpen((open) => !open)}
          ><StickyNote size={16} /></button>
        </div>
      </div>
      <div
        ref={editorRef}
        className="script-block-editor"
        contentEditable
        role="textbox"
        aria-label={`Texto do bloco ${definition.number} · ${definition.title}`}
        aria-multiline="true"
        data-placeholder={definition.placeholder}
        suppressContentEditableWarning
        style={{ color: block.color, minHeight: `${Math.max(104, definition.rows * 27)}px` }}
        onInput={commitEditor}
        onBlur={commitEditor}
        onKeyDown={handleEditorKeyDown}
        onPaste={handlePaste}
      />
      {noteOpen && (
        <div className="block-note">
          <StickyNote size={16} />
          <textarea rows={2} value={block.note} onChange={(event) => onChange({ note: event.target.value })} placeholder="Adicione uma nota de gravação, cena, corte ou referência..." />
        </div>
      )}
    </section>
  );
}

function PerformanceView({
  demo,
  connectionState,
  account,
  metrics,
  metricsLoading,
  period,
  onConnect,
  onPeriodChange,
  onRefresh,
  onDisableDemo,
  onCreateFromInsight,
  onNotify,
}: {
  demo: boolean;
  connectionState: InstagramConnectionState;
  account: InstagramAccount | null;
  metrics: InstagramMetrics | null;
  metricsLoading: boolean;
  period: 30 | 90;
  onConnect: () => void;
  onPeriodChange: (period: 30 | 90) => void;
  onRefresh: () => void;
  onDisableDemo: () => void;
  onCreateFromInsight: () => void;
  onNotify: (message: string) => void;
}) {
  type DemoPeriod = "30" | "90" | "year";
  const [demoPeriod, setDemoPeriod] = useState<DemoPeriod>("30");
  const datasets: Record<DemoPeriod, { views: string; reach: string; engagement: string; followers: string; total: string; growth: string; bars: number[] }> = {
    "30": { views: "128,4 mil", reach: "74,8 mil", engagement: "6,8%", followers: "+1.284", total: "128.420", growth: "18,2%", bars: [38, 52, 45, 67, 58, 82, 72, 92, 76, 88, 66, 96] },
    "90": { views: "361,7 mil", reach: "205,2 mil", engagement: "6,1%", followers: "+3.506", total: "361.740", growth: "24,7%", bars: [32, 45, 41, 55, 63, 59, 70, 74, 68, 82, 88, 94] },
    year: { views: "1,2 mi", reach: "684 mil", engagement: "5,9%", followers: "+11.842", total: "1.204.870", growth: "31,4%", bars: [25, 31, 43, 39, 52, 61, 56, 68, 75, 79, 87, 98] },
  };
  const data = datasets[demoPeriod];
  const ranking = [
    ["Proteína depois dos 60", "Reel · 01 ago", "42,8 mil", "71%", "3.842", "9,4"],
    ["Creatina: o mito dos rins", "Reel · 27 jul", "31,2 mil", "68%", "2.915", "9,1"],
    ["O que a balança não mostra", "Carrossel · 24 jul", "18,6 mil", "62%", "2.104", "8,7"],
  ];

  if (connectionState === "connected") {
    return (
      <InstagramPerformance
        account={account}
        metrics={metrics}
        loading={metricsLoading}
        period={period}
        onPeriodChange={onPeriodChange}
        onRefresh={onRefresh}
        onNotify={onNotify}
      />
    );
  }

  function exportReport() {
    const rows = [["Conteúdo", "Formato/Data", "Visualizações", "Retenção", "Interações", "Nota MAPA"], ...ranking];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mapa-relatorio-${demoPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onNotify("Relatório de demonstração exportado.");
  }

  if (!demo) {
    return (
      <>
        <section className="connect-banner">
          <div className="connect-visual"><Instagram size={29} /><span><i /><i /><i /></span></div>
          <div><span className="eyebrow">PAINEL ZERADO</span><h2>Conecte seus dados quando estiver pronto</h2><p>Nenhuma métrica fictícia é exibida. Você também pode conhecer o painel usando a demonstração identificada.</p></div>
          <button className="button instagram-button" onClick={onConnect}><Instagram size={18} /> Ver opções</button>
        </section>
        <section className="metrics-grid analytics-metrics">
          <MetricCard icon={<Eye size={19} />} tone="lime" label="Visualizações" value="0" detail="Sem dados importados" />
          <MetricCard icon={<Users size={19} />} tone="blue" label="Alcance" value="0" detail="Sem dados importados" />
          <MetricCard icon={<Heart size={19} />} tone="coral" label="Engajamento" value="0%" detail="Sem dados importados" />
          <MetricCard icon={<TrendingUp size={19} />} tone="violet" label="Novos seguidores" value="0" detail="Sem dados importados" />
        </section>
        <section className="panel empty-analytics">
          <span className="empty-state-icon"><BarChart3 size={28} /></span>
          <h2>Nenhum desempenho registrado</h2>
          <p>Quando a integração oficial estiver configurada, seus conteúdos e métricas aparecerão aqui.</p>
          <button className="button secondary" onClick={onConnect}><Instagram size={17} /> Conhecer a integração</button>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="demo-banner"><span><Sparkles size={16} /> Modo demonstração</span><p>Os números abaixo são apenas exemplos e não pertencem à sua conta.</p><button onClick={onDisableDemo}>Sair da demonstração <X size={15} /></button></div>

      <section className="analytics-head">
        <div className="period-tabs">
          <button className={demoPeriod === "30" ? "active" : ""} onClick={() => setDemoPeriod("30")}>Últimos 30 dias</button>
          <button className={demoPeriod === "90" ? "active" : ""} onClick={() => setDemoPeriod("90")}>90 dias</button>
          <button className={demoPeriod === "year" ? "active" : ""} onClick={() => setDemoPeriod("year")}>Este ano</button>
        </div>
        <span className="sync-state demo"><span /> Dados de demonstração</span>
      </section>
      <section className="metrics-grid analytics-metrics">
        <MetricCard icon={<Eye size={19} />} tone="lime" label="Visualizações" value={data.views} detail="Exemplo do período" positive />
        <MetricCard icon={<Users size={19} />} tone="blue" label="Alcance" value={data.reach} detail="Exemplo do período" positive />
        <MetricCard icon={<Heart size={19} />} tone="coral" label="Engajamento" value={data.engagement} detail="Exemplo do período" positive />
        <MetricCard icon={<TrendingUp size={19} />} tone="violet" label="Novos seguidores" value={data.followers} detail="Exemplo do período" positive />
      </section>

      <section className="analytics-grid">
        <div className="panel chart-panel">
          <PanelHeader eyebrow="EVOLUÇÃO" title="Visualizações por publicação" action="Ver detalhes" onAction={() => onNotify(`Período selecionado: ${demoPeriod === "30" ? "últimos 30 dias" : demoPeriod === "90" ? "90 dias" : "este ano"}.`)} />
          <div className="chart-total"><strong>{data.total}</strong><span><TrendingUp size={14} /> {data.growth}</span><small>exemplo comparativo</small></div>
          <div className="bar-chart">{data.bars.map((height, index) => <div key={index} className={index === 11 ? "highlight" : ""}><span style={{ height: `${height}%` }} /><small>{index % 2 === 0 ? `${index + 1}` : ""}</small></div>)}</div>
        </div>
        <div className="panel insight-panel">
          <div className="insight-heading"><span className="panel-icon"><Sparkles size={18} /></span><div><span className="eyebrow">INSIGHT DE EXEMPLO</span><h2>Seu padrão vencedor</h2></div></div>
          <p className="insight-lead">Conteúdos que <strong>abrem com uma pergunta clínica</strong> podem gerar mais salvamentos.</p>
          <div className="insight-proof"><span><Bookmark size={17} /> Salvamentos do exemplo</span><strong>642</strong><small>vs. 268 nos demais</small></div>
          <div className="next-action"><Lightbulb size={18} /><p><strong>Próxima ação</strong>Comece o próximo Reel com: “O que a balança não está mostrando?”</p></div>
          <button className="button secondary full" onClick={onCreateFromInsight}><PencilLine size={17} /> Criar roteiro a partir deste insight</button>
        </div>
      </section>

      <section className="panel top-content-panel">
        <PanelHeader eyebrow="RANKING DE EXEMPLO" title="Conteúdos com melhor desempenho" action="Exportar relatório" onAction={exportReport} />
        <div className="ranking-table">
          <div className="ranking-row ranking-head"><span>Conteúdo</span><span>Visualizações</span><span>Retenção</span><span>Interações</span><span>Nota MAPA</span></div>
          {ranking.map((row, index) => (
            <div className="ranking-row" key={row[0]}><span className="rank-title"><em>0{index + 1}</em><i className={`rank-thumb thumb-${index + 1}`}><Play size={15} /></i><span><strong>{row[0]}</strong><small>{row[1]}</small></span></span><span>{row[2]}</span><span>{row[3]}</span><span className="interaction-icons"><Heart size={14} /> {row[4]}</span><span className="mapa-score"><Sparkles size={14} /> {row[5]}</span></div>
          ))}
        </div>
      </section>
    </>
  );
}

function MetricCard({ icon, tone, label, value, detail, positive }: { icon: React.ReactNode; tone: string; label: string; value: string; detail: string; positive?: boolean }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p className={positive ? "positive" : ""}>{positive && <TrendingUp size={13} />} {detail}</p></div></article>;
}

function EmptyWorkspace({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="panel empty-workspace">
      <span className="empty-state-icon"><FileText size={30} /></span>
      <span className="eyebrow">BIBLIOTECA VAZIA</span>
      <h2>Crie seu primeiro roteiro</h2>
      <p>O aplicativo está zerado. Adicione uma pauta e use o editor para construir gancho, roteiro, CTA e direção visual.</p>
      <button className="button primary" onClick={onAdd}><Plus size={18} /> Novo conteúdo</button>
    </section>
  );
}

function PanelHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action && <button className="text-button" onClick={onAction}>{action}<ChevronRight size={16} /></button>}</div>;
}

function EmptyMini({ text }: { text: string }) {
  return <div className="empty-mini"><CalendarDays size={20} /><span>{text}</span></div>;
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-layer"><button className="backdrop" aria-label="Fechar janela" onClick={onClose} /><div className={`modal-card ${wide ? "wide" : ""}`} role="dialog" aria-modal="true"><button className="modal-close" aria-label="Fechar" onClick={onClose}><X size={20} /></button>{children}</div></div>;
}
