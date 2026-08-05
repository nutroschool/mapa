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
  Clock3,
  Eye,
  FileText,
  Filter,
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
  PencilLine,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  UserPlus,
  Video,
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
import InstagramPerformance from "@/components/InstagramPerformance";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type View = "hoje" | "calendario" | "roteiros" | "desempenho";
type Status = "Ideia" | "Roteiro" | "Gravação" | "Edição" | "Agendado" | "Publicado";

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
};

const initialContents: ContentItem[] = [];

const statusOrder: Status[] = ["Ideia", "Roteiro", "Gravação", "Edição", "Agendado", "Publicado"];
const weekDays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const storageKey = "mapa-content-items-v2";
const instagramDemoKey = "mapa-instagram-demo-v2";
const todayIso = "2026-08-04";

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

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
}

function rowToContent(row: ContentRow): ContentItem {
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    pillar: row.pillar,
    status: row.status,
    date: row.scheduled_date,
    duration: row.duration,
    hook: row.hook,
    script: row.script,
    cta: row.cta,
    notes: row.notes,
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
  };
}

export default function Home() {
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!authReady) return <AppLoading />;
  if (isSupabaseConfigured && !user) return <AuthScreen />;

  return <Workspace user={user} />;
}

function Workspace({ user }: { user: User | null }) {
  const [view, setView] = useState<View>("hoje");
  const [contents, setContents] = useState<ContentItem[]>(initialContents);
  const [ready, setReady] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [instagramOpen, setInstagramOpen] = useState(false);
  const [instagramDemo, setInstagramDemo] = useState(false);
  const [instagramState, setInstagramState] = useState<InstagramConnectionState>("checking");
  const [instagramAccount, setInstagramAccount] = useState<InstagramAccount | null>(null);
  const [instagramMetrics, setInstagramMetrics] = useState<InstagramMetrics | null>(null);
  const [instagramPeriod, setInstagramPeriod] = useState<30 | 90>(30);
  const [instagramMetricsLoading, setInstagramMetricsLoading] = useState(false);
  const [instagramError, setInstagramError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [utilityModal, setUtilityModal] = useState<"help" | "notifications" | "profile" | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const saveTimersRef = useRef<Record<string, number>>({});
  const [newItem, setNewItem] = useState({
    title: "",
    format: "Reel" as ContentItem["format"],
    pillar: "Educação",
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

  useEffect(() => {
    let active = true;
    const saveTimers = saveTimersRef.current;

    async function loadWorkspace() {
      setInstagramDemo(window.localStorage.getItem(instagramDemoKey) === "true");

      if (supabase && user) {
        const { data, error } = await supabase
          .from("content_items")
          .select("id,title,format,pillar,status,scheduled_date,duration,hook,script,cta,notes")
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
              ? parsed.map((item) => ({ ...item, id: String(item.id) }))
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
    if (!user) return;
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const result = params.get("instagram");
      if (!result) return;

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
      setInstagramError("A Meta não concluiu a autorização. Tente novamente.");
      setToast("Não foi possível conectar o Instagram.");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadInstagramStatus, user]);

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
    setContents((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    if (supabase && user) {
      void supabase
        .from("content_items")
        .update({ status })
        .eq("id", id)
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) announce("A etapa mudou na tela, mas não foi salva. Tente novamente.");
        });
    }
    announce(`Conteúdo movido para ${status}.`);
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
    };
    setContents((items) => [...items, item]);
    setSelectedId(item.id);
    setAddOpen(false);
    setNewItem({ title: "", format: "Reel", pillar: "Educação", date: todayIso, status: "Ideia" });
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
      pillar: "Educação",
      status: "Roteiro",
      date: todayIso,
      duration: "60s",
      hook: "O que a balança não está mostrando sobre o seu progresso?",
      script: "",
      cta: "",
      notes: "Ideia criada a partir de um insight do painel de demonstração.",
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
      eyebrow: "TERÇA-FEIRA, 4 DE AGOSTO",
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
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><span>M</span></div>
          <div>
            <strong>MAPA</strong>
            <small>conteúdo em movimento</small>
          </div>
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
          {view === "calendario" && <CalendarView contents={filteredContents} onAdd={openAdd} onSelect={(id) => { setSelectedId(id); setView("roteiros"); }} />}
          {view === "roteiros" && selected && (
            <ScriptsView
              contents={filteredContents}
              selected={selected}
              onSelect={setSelectedId}
              onUpdate={updateSelected}
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
              <label>Pilar<input value={newItem.pillar} onChange={(event) => setNewItem({ ...newItem, pillar: event.target.value })} /></label>
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

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function changeMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setFeedback(null);
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || submitting) return;

    const cleanEmail = email.trim().toLowerCase();
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
          <h2>{mode === "login" ? "Entre no seu espaço" : "Crie sua conta"}</h2>
          <p>{mode === "login" ? "Use seu e-mail e senha para continuar de onde parou." : "Seu espaço começa zerado e será sincronizado com segurança."}</p>

          <div className="auth-tabs" aria-label="Tipo de acesso">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}><LogIn size={17} /> Entrar</button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")}><UserPlus size={17} /> Criar conta</button>
          </div>

          <form className="auth-form" onSubmit={submitAuth}>
            {mode === "signup" && <label>Seu nome<div className="auth-input"><UserPlus size={18} /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos chamar você?" /></div></label>}
            <label>E-mail<div className="auth-input"><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" /></div></label>
            <label>Senha<div className="auth-input"><LockKeyhole size={18} /><input type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" /></div></label>
            {mode === "signup" && <label>Confirme a senha<div className="auth-input"><LockKeyhole size={18} /><input type="password" minLength={8} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="Digite a senha novamente" /></div></label>}
            {feedback && <div className={`auth-feedback ${feedback.tone}`} role="status">{feedback.tone === "success" ? <CheckCircle2 size={18} /> : <CircleHelp size={18} />}<span>{feedback.text}</span></div>}
            <button className="button primary auth-submit" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={19} /> : mode === "login" ? <LogIn size={19} /> : <UserPlus size={19} />}{submitting ? "Aguarde..." : mode === "login" ? "Entrar no MAPA" : "Criar meu espaço"}</button>
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

function CalendarView({ contents, onAdd, onSelect }: { contents: ContentItem[]; onAdd: (date?: string) => void; onSelect: (id: string) => void }) {
  const referenceToday = new Date(`${todayIso}T12:00:00`);
  const [month, setMonth] = useState(new Date(referenceToday.getFullYear(), referenceToday.getMonth(), 1));
  const [filterOpen, setFilterOpen] = useState(false);
  const [formatFilter, setFormatFilter] = useState<"Todos" | ContentItem["format"]>("Todos");
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
  const filteredByFormat = formatFilter === "Todos" ? contents : contents.filter((item) => item.format === formatFilter);

  function changeMonth(offset: number) {
    setMonth(new Date(year, monthIndex + offset, 1));
  }

  return (
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="month-switcher"><button className="icon-button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button><h2>{monthName} <span>{year}</span></h2><button className="icon-button" aria-label="Próximo mês" onClick={() => changeMonth(1)}><ChevronRight size={19} /></button></div>
        <div className="toolbar-actions">
          <div className="filter-wrap">
            <button className="button ghost small" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}><Filter size={16} /> {formatFilter === "Todos" ? "Filtrar" : formatFilter}</button>
            {filterOpen && <div className="filter-menu">{(["Todos", "Reel", "Carrossel", "Stories", "YouTube"] as const).map((format) => <button key={format} className={formatFilter === format ? "active" : ""} onClick={() => { setFormatFilter(format); setFilterOpen(false); }}>{formatFilter === format && <Check size={14} />}{format}</button>)}</div>}
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
          const dayItems = filteredByFormat.filter((item) => item.date === date);
          return (
            <div className={`day-cell ${date === todayIso ? "current-day" : ""}`} key={date} onDoubleClick={() => onAdd(date)}>
              <div className="day-number"><span>{day}</span>{dayItems.length > 0 && <button aria-label={`Adicionar em ${day} de ${monthName}`} onClick={() => onAdd(date)}><Plus size={13} /></button>}</div>
              <div className="day-items">
                {dayItems.slice(0, 3).map((item) => <button key={item.id} className={`calendar-item ${formatColors[item.format]}`} onClick={() => onSelect(item.id)}><span>{item.format === "Reel" ? <Play size={11} fill="currentColor" /> : <FileText size={11} />}</span><strong>{item.title}</strong></button>)}
              </div>
              {dayItems.length === 0 && <button className="day-add" aria-label={`Adicionar conteúdo em ${day} de ${monthName}`} onClick={() => onAdd(date)}><Plus size={14} /></button>}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend"><span><i className="coral" /> Reel</span><span><i className="violet" /> Carrossel</span><span><i className="amber" /> Stories</span><span><i className="red" /> YouTube</span><small>Dica: dê dois cliques em um dia para adicionar uma pauta.</small></div>
    </section>
  );
}

function ScriptsView({ contents, selected, onSelect, onUpdate, onSave, onAdd }: { contents: ContentItem[]; selected: ContentItem; onSelect: (id: string) => void; onUpdate: (field: keyof ContentItem, value: string) => void; onSave: () => void; onAdd: () => void }) {
  const [libraryFilter, setLibraryFilter] = useState<"Todos" | "Em roteiro" | "Prontos">("Todos");
  const visibleContents = contents.filter((item) => {
    if (libraryFilter === "Em roteiro") return item.status === "Roteiro";
    if (libraryFilter === "Prontos") return ["Agendado", "Publicado"].includes(item.status);
    return true;
  });

  return (
    <section className="scripts-layout">
      <aside className="panel script-library">
        <div className="library-head"><div><span className="eyebrow">BIBLIOTECA</span><h2>Seus conteúdos</h2></div><button className="icon-button dark" aria-label="Novo roteiro" onClick={onAdd}><Plus size={18} /></button></div>
        <div className="library-filters">
          {(["Todos", "Em roteiro", "Prontos"] as const).map((filter) => <button key={filter} className={libraryFilter === filter ? "active" : ""} onClick={() => setLibraryFilter(filter)}>{filter}{filter === "Todos" && <span>{contents.length}</span>}</button>)}
        </div>
        <div className="library-list">
          {visibleContents.map((item) => (
            <button key={item.id} className={item.id === selected.id ? "library-item selected" : "library-item"} onClick={() => onSelect(item.id)}>
              <span className={`format-icon mini ${formatColors[item.format]}`}>{item.format === "Reel" ? <Play size={15} /> : <FileText size={15} />}</span>
              <span><strong>{item.title}</strong><small>{item.format} · Salvo no MAPA</small></span>
              <ChevronRight size={16} />
            </button>
          ))}
          {visibleContents.length === 0 && <div className="library-empty"><FileText size={22} /><strong>Nenhum conteúdo aqui</strong><small>Escolha outro filtro ou adicione uma nova pauta.</small></div>}
        </div>
      </aside>

      <article className="panel editor-panel">
        <div className="editor-toolbar">
          <div className="editor-title"><span className={`micro-tag ${formatColors[selected.format]}`}>{selected.format}</span><span className={`status-pill status-${selected.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}>{selected.status}</span></div>
          <div><span className="saved-state"><Check size={15} /> Salvo automaticamente</span><button className="button primary small" onClick={onSave}><Save size={16} /> Salvar</button></div>
        </div>
        <div className="editor-scroll">
          <label className="title-input"><span>TÍTULO</span><input value={selected.title} onChange={(event) => onUpdate("title", event.target.value)} /></label>
          <div className="brief-row"><span><CalendarDays size={15} /> {formatShortDate(selected.date)}</span><span><Clock3 size={15} /> {selected.duration}</span><span><Target size={15} /> {selected.pillar}</span></div>
          <div className="editor-section hook-section">
            <div className="section-label"><span className="number-badge">01</span><span><strong>Gancho</strong><small>A primeira frase que interrompe o scroll</small></span><Sparkles size={17} /></div>
            <textarea rows={3} value={selected.hook} onChange={(event) => onUpdate("hook", event.target.value)} placeholder="Escreva aqui a frase de abertura..." />
          </div>
          <div className="editor-section">
            <div className="section-label"><span className="number-badge">02</span><span><strong>Roteiro</strong><small>Desenvolvimento da ideia em linguagem natural</small></span><FileText size={17} /></div>
            <textarea className="script-textarea" rows={11} value={selected.script} onChange={(event) => onUpdate("script", event.target.value)} placeholder="Desenvolva o conteúdo principal..." />
            <div className="word-count">{selected.script.trim() ? selected.script.trim().split(/\s+/).length : 0} palavras · aprox. {Math.max(0, Math.ceil((selected.script.trim() ? selected.script.trim().split(/\s+/).length : 0) / 2.2))} segundos</div>
          </div>
          <div className="two-editor-sections">
            <div className="editor-section compact"><div className="section-label"><span className="number-badge">03</span><span><strong>CTA</strong><small>Próxima ação</small></span></div><textarea rows={4} value={selected.cta} onChange={(event) => onUpdate("cta", event.target.value)} placeholder="O que a pessoa deve fazer?" /></div>
            <div className="editor-section compact"><div className="section-label"><span className="number-badge">04</span><span><strong>Direção visual</strong><small>Cenas e objetos</small></span></div><textarea rows={4} value={selected.notes} onChange={(event) => onUpdate("notes", event.target.value)} placeholder="Anote cenas, objetos e textos na tela..." /></div>
          </div>
        </div>
      </article>
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
