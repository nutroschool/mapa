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
  Menu,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type View = "hoje" | "calendario" | "roteiros" | "desempenho";
type Status = "Ideia" | "Roteiro" | "Gravação" | "Edição" | "Agendado" | "Publicado";

type ContentItem = {
  id: number;
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

const initialContents: ContentItem[] = [
  {
    id: 1,
    title: "Creatina faz mal para os rins?",
    format: "Reel",
    pillar: "Mitos",
    status: "Gravação",
    date: "2026-08-04",
    duration: "60–90s",
    hook: "Se você ainda tem medo da creatina por causa dos rins, precisa ver isso.",
    script:
      "A creatinina pode subir um pouco sem que isso signifique lesão renal. O nome parece igual, mas creatina e creatinina não são a mesma coisa.\n\nO ponto é: em pessoas saudáveis e nas doses recomendadas, as evidências não mostram que a creatina cause dano renal. A avaliação muda quando já existe doença renal ou outra condição clínica — e aí a conversa precisa ser individualizada.",
    cta: "Envie este vídeo para quem ainda repete esse mito.",
    notes: "Mostrar pote de creatina no primeiro segundo. Inserir referência na legenda.",
  },
  {
    id: 2,
    title: "GLP-1 e perda de massa muscular",
    format: "Carrossel",
    pillar: "Atualização médica",
    status: "Roteiro",
    date: "2026-08-06",
    duration: "8 páginas",
    hook: "O peso caiu. Mas o que aconteceu com a composição corporal?",
    script:
      "Estrutura do carrossel:\n1. A pergunta que a balança não responde\n2. O que compõe a perda de peso\n3. Por que proteína e exercício importam\n4. O que acompanhar na prática\n5. Conduta deve ser individualizada",
    cta: "Salve para revisar antes da próxima consulta.",
    notes: "Usar gráfico simples de composição da perda de peso.",
  },
  {
    id: 3,
    title: "3 erros no café da manhã",
    format: "Reel",
    pillar: "Nutrição prática",
    status: "Edição",
    date: "2026-08-05",
    duration: "45s",
    hook: "Seu café da manhã parece saudável — mas pode estar sabotando sua saciedade.",
    script: "Abrir com três pratos na bancada. Comparar proteína, fibra e densidade energética.",
    cta: "Comente qual desses erros mais aparece na sua rotina.",
    notes: "Captar planos de apoio dos alimentos.",
  },
  {
    id: 4,
    title: "Semaglutida oral: o que mudou",
    format: "YouTube",
    pillar: "Evidência",
    status: "Ideia",
    date: "2026-08-12",
    duration: "8–10 min",
    hook: "A via mudou. O raciocínio clínico também precisa mudar?",
    script: "",
    cta: "",
    notes: "Cruzar SOUL, desfechos e aplicabilidade clínica.",
  },
  {
    id: 5,
    title: "Bastidores da gravação NutroSchool",
    format: "Stories",
    pillar: "Bastidores",
    status: "Agendado",
    date: "2026-08-07",
    duration: "5 stories",
    hook: "O que acontece antes da câmera ligar?",
    script: "Entrada do estúdio → pauta → teleprompter → gravação → revisão.",
    cta: "Responda: qual tema você quer na próxima aula?",
    notes: "Publicar entre 11h e 12h.",
  },
  {
    id: 6,
    title: "Proteína depois dos 60",
    format: "Reel",
    pillar: "Longevidade",
    status: "Publicado",
    date: "2026-08-01",
    duration: "72s",
    hook: "Depois dos 60, comer a mesma quantidade de proteína pode não produzir a mesma resposta.",
    script: "Explicar resistência anabólica com linguagem acessível.",
    cta: "Salve para conversar com seu profissional de saúde.",
    notes: "Publicado às 19h30.",
  },
];

const statusOrder: Status[] = ["Ideia", "Roteiro", "Gravação", "Edição", "Agendado", "Publicado"];
const weekDays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const storageKey = "mapa-content-items-v1";

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

export default function Home() {
  const [view, setView] = useState<View>("hoje");
  const [contents, setContents] = useState<ContentItem[]>(initialContents);
  const [ready, setReady] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [instagramOpen, setInstagramOpen] = useState(false);
  const [instagramDemo, setInstagramDemo] = useState(false);
  const [selectedId, setSelectedId] = useState(1);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [newItem, setNewItem] = useState({
    title: "",
    format: "Reel" as ContentItem["format"],
    pillar: "Educação",
    date: "2026-08-08",
    status: "Ideia" as Status,
  });

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        setContents(JSON.parse(saved));
      } catch {
        setContents(initialContents);
      }
    }
    setInstagramDemo(window.localStorage.getItem("mapa-instagram-demo") === "true");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(storageKey, JSON.stringify(contents));
  }, [contents, ready]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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

  function announce(message: string) {
    setToast(message);
  }

  function changeStatus(id: number, status: Status) {
    setContents((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    announce(`Conteúdo movido para ${status}.`);
  }

  function updateSelected(field: keyof ContentItem, value: string) {
    setContents((items) => items.map((item) => (item.id === selectedId ? { ...item, [field]: value } : item)));
  }

  function addContent(event: React.FormEvent) {
    event.preventDefault();
    if (!newItem.title.trim()) return;
    const item: ContentItem = {
      id: Date.now(),
      ...newItem,
      duration: newItem.format === "Carrossel" ? "8 páginas" : "60s",
      hook: "",
      script: "",
      cta: "",
      notes: "",
    };
    setContents((items) => [...items, item]);
    setSelectedId(item.id);
    setAddOpen(false);
    setNewItem({ title: "", format: "Reel", pillar: "Educação", date: "2026-08-08", status: "Ideia" });
    announce("Novo conteúdo adicionado ao MAPA.");
  }

  function openAdd(date?: string) {
    if (date) setNewItem((item) => ({ ...item, date }));
    setAddOpen(true);
  }

  function enableInstagramDemo() {
    window.localStorage.setItem("mapa-instagram-demo", "true");
    setInstagramDemo(true);
    setInstagramOpen(false);
    announce("Modo demonstração ativado no painel.");
  }

  const titles: Record<View, { eyebrow: string; title: string; subtitle: string }> = {
    hoje: {
      eyebrow: "TERÇA-FEIRA, 4 DE AGOSTO",
      title: "Bom dia, José.",
      subtitle: "Seu ritmo está bom. Vamos transformar as próximas ideias em publicações?",
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
          <div className="goal-head"><span><Target size={16} /> Meta da semana</span><strong>3/5</strong></div>
          <div className="progress-track"><span style={{ width: "60%" }} /></div>
          <small>2 conteúdos para fechar a meta</small>
        </div>
        <button className="nav-item quiet"><CircleHelp size={19} /><span>Central de ajuda</span></button>
        <button className="profile-button">
          <span className="avatar">JE</span>
          <span><strong>José Enrique</strong><small>Meu espaço</small></span>
          <MoreHorizontal size={18} />
        </button>
      </aside>

      {mobileMenu && <button className="backdrop nav-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenu(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
          <div className="search-box">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conteúdo, tema ou formato..." aria-label="Buscar conteúdo" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <button className="icon-button notification" aria-label="Notificações"><Bell size={20} /><span /></button>
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
              <button className={`button ${instagramDemo ? "connected" : "secondary"}`} onClick={() => setInstagramOpen(true)}>
                <Instagram size={18} /> {instagramDemo ? "Instagram em demonstração" : "Conectar Instagram"}
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
              onSave={() => announce("Roteiro salvo neste dispositivo.")}
              onAdd={() => openAdd()}
            />
          )}
          {view === "desempenho" && <PerformanceView demo={instagramDemo} onConnect={() => setInstagramOpen(true)} />}
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
            <h2>Conectar Instagram Profissional</h2>
            <p>O MAPA poderá importar seus Reels e transformar alcance, retenção e engajamento em decisões para a próxima pauta.</p>
            <div className="connection-steps">
              <div><span>1</span><p><strong>Conta profissional</strong><small>O perfil precisa ser Criador ou Empresa.</small></p><Check size={18} /></div>
              <div><span>2</span><p><strong>Autorização segura</strong><small>O login acontece pela Meta. Sua senha não passa pelo MAPA.</small></p><Link2 size={18} /></div>
              <div><span>3</span><p><strong>Sincronização de insights</strong><small>O painel organiza as métricas disponíveis pela API oficial.</small></p><BarChart3 size={18} /></div>
            </div>
            <div className="info-note"><Lightbulb size={19} /><p><strong>Nesta primeira versão:</strong> use dados de demonstração. Para conectar sua conta real, será necessário cadastrar o MAPA na Meta e autorizar as permissões de insights.</p></div>
            <div className="modal-actions stacked-mobile"><button className="button ghost" onClick={() => setInstagramOpen(false)}>Agora não</button><button className="button instagram-button" onClick={enableInstagramDemo}><Instagram size={18} /> Explorar com dados de demonstração</button></div>
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role="status"><CheckCircle2 size={19} />{toast}</div>}
    </div>
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
  onSelect: (id: number) => void;
  onStatusChange: (id: number, status: Status) => void;
  onAdd: () => void;
}) {
  const todayItems = contents.filter((item) => ["2026-08-04", "2026-08-05"].includes(item.date));
  const boardStatuses: Status[] = ["Ideia", "Roteiro", "Gravação", "Edição", "Agendado"];
  return (
    <>
      <section className="metrics-grid">
        <MetricCard icon={<Zap size={19} />} tone="lime" label="Em produção" value={String(inProgress)} detail="3 etapas ativas" />
        <MetricCard icon={<CalendarDays size={19} />} tone="blue" label="Agendados" value={String(scheduled)} detail="Próximos 7 dias" />
        <MetricCard icon={<CheckCircle2 size={19} />} tone="violet" label="Publicados" value={String(published)} detail="Neste mês" />
        <MetricCard icon={<Target size={19} />} tone="coral" label="Consistência" value="60%" detail="+12% vs. julho" positive />
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
          <div className="momentum-top"><span className="panel-icon"><TrendingUp size={19} /></span><span><small>RITMO DE PUBLICAÇÃO</small><strong>Boa cadência!</strong></span></div>
          <div className="streak-row"><strong>4</strong><span>semanas<br />consistentes</span></div>
          <div className="week-dots">{[true, true, true, false, true, false, false].map((active, index) => <div key={weekDays[index]}><span className={active ? "done" : index === 4 ? "today" : ""}>{active ? <Check size={15} /> : weekDays[index].slice(0, 1)}</span><small>{weekDays[index]}</small></div>)}</div>
          <p>Você publica melhor quando grava em lote. Reserve sexta-feira para os próximos 3 vídeos.</p>
          <button className="text-button" onClick={() => onView("desempenho")}>Ver análise completa <ArrowUpRight size={16} /></button>
        </div>
      </section>

      <section className="panel pipeline-panel">
        <PanelHeader eyebrow="FLUXO DE PRODUÇÃO" title="Do rascunho à publicação" action="Adicionar ideia" onAction={onAdd} />
        <div className="kanban-board">
          {boardStatuses.map((status) => {
            const items = contents.filter((item) => item.status === status).slice(0, 2);
            return (
              <div className="kanban-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onStatusChange(Number(event.dataTransfer.getData("text/plain")), status)}>
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

function CalendarView({ contents, onAdd, onSelect }: { contents: ContentItem[]; onAdd: (date?: string) => void; onSelect: (id: number) => void }) {
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  const slots = [...Array(5).fill(null), ...days];
  return (
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="month-switcher"><button className="icon-button" aria-label="Mês anterior"><ChevronLeft size={19} /></button><h2>Agosto <span>2026</span></h2><button className="icon-button" aria-label="Próximo mês"><ChevronRight size={19} /></button></div>
        <div className="toolbar-actions"><button className="button ghost small"><Filter size={16} /> Filtrar</button><button className="button secondary small">Hoje</button><button className="button primary small" onClick={() => onAdd()}><Plus size={16} /> Adicionar</button></div>
      </div>
      <div className="calendar-grid calendar-weekdays">{weekDays.map((day) => <div key={day}>{day}</div>)}</div>
      <div className="calendar-grid month-grid">
        {slots.map((day, index) => {
          if (!day) return <div className="day-cell outside" key={`blank-${index}`} />;
          const date = `2026-08-${String(day).padStart(2, "0")}`;
          const dayItems = contents.filter((item) => item.date === date);
          return (
            <div className={`day-cell ${day === 4 ? "current-day" : ""}`} key={date} onDoubleClick={() => onAdd(date)}>
              <div className="day-number"><span>{day}</span>{dayItems.length > 0 && <button aria-label={`Adicionar em ${day} de agosto`} onClick={() => onAdd(date)}><Plus size={13} /></button>}</div>
              <div className="day-items">
                {dayItems.slice(0, 3).map((item) => <button key={item.id} className={`calendar-item ${formatColors[item.format]}`} onClick={() => onSelect(item.id)}><span>{item.format === "Reel" ? <Play size={11} fill="currentColor" /> : <FileText size={11} />}</span><strong>{item.title}</strong></button>)}
              </div>
              {dayItems.length === 0 && <button className="day-add" onClick={() => onAdd(date)}><Plus size={14} /></button>}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend"><span><i className="coral" /> Reel</span><span><i className="violet" /> Carrossel</span><span><i className="amber" /> Stories</span><span><i className="red" /> YouTube</span><small>Dica: dê dois cliques em um dia para adicionar uma pauta.</small></div>
    </section>
  );
}

function ScriptsView({ contents, selected, onSelect, onUpdate, onSave, onAdd }: { contents: ContentItem[]; selected: ContentItem; onSelect: (id: number) => void; onUpdate: (field: keyof ContentItem, value: string) => void; onSave: () => void; onAdd: () => void }) {
  return (
    <section className="scripts-layout">
      <aside className="panel script-library">
        <div className="library-head"><div><span className="eyebrow">BIBLIOTECA</span><h2>Seus conteúdos</h2></div><button className="icon-button dark" aria-label="Novo roteiro" onClick={onAdd}><Plus size={18} /></button></div>
        <div className="library-filters"><button className="active">Todos <span>{contents.length}</span></button><button>Em roteiro</button><button>Prontos</button></div>
        <div className="library-list">
          {contents.map((item) => (
            <button key={item.id} className={item.id === selected.id ? "library-item selected" : "library-item"} onClick={() => onSelect(item.id)}>
              <span className={`format-icon mini ${formatColors[item.format]}`}>{item.format === "Reel" ? <Play size={15} /> : <FileText size={15} />}</span>
              <span><strong>{item.title}</strong><small>{item.format} · Editado {item.id % 2 ? "hoje" : "ontem"}</small></span>
              <ChevronRight size={16} />
            </button>
          ))}
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

function PerformanceView({ demo, onConnect }: { demo: boolean; onConnect: () => void }) {
  const bars = [38, 52, 45, 67, 58, 82, 72, 92, 76, 88, 66, 96];
  return (
    <>
      {!demo && (
        <section className="connect-banner">
          <div className="connect-visual"><Instagram size={29} /><span><i /><i /><i /></span></div>
          <div><span className="eyebrow">TRANSFORME NÚMEROS EM DECISÕES</span><h2>Descubra o padrão por trás dos seus melhores conteúdos</h2><p>Conecte uma conta profissional ou explore o painel com dados de demonstração.</p></div>
          <button className="button instagram-button" onClick={onConnect}><Instagram size={18} /> Explorar integração</button>
        </section>
      )}
      {demo && <div className="demo-banner"><span><Sparkles size={16} /> Modo demonstração</span><p>Estes dados ilustram como suas métricas reais aparecerão depois da conexão oficial.</p><button onClick={onConnect}>Configurar conexão <ChevronRight size={15} /></button></div>}

      <section className="analytics-head">
        <div className="period-tabs"><button className="active">Últimos 30 dias</button><button>90 dias</button><button>Este ano</button></div>
        <span className="sync-state"><span /> Atualizado há 12 min</span>
      </section>
      <section className="metrics-grid analytics-metrics">
        <MetricCard icon={<Eye size={19} />} tone="lime" label="Visualizações" value="128,4 mil" detail="+18,2% no período" positive />
        <MetricCard icon={<Users size={19} />} tone="blue" label="Alcance" value="74,8 mil" detail="+9,6% no período" positive />
        <MetricCard icon={<Heart size={19} />} tone="coral" label="Engajamento" value="6,8%" detail="+1,4 p.p. no período" positive />
        <MetricCard icon={<TrendingUp size={19} />} tone="violet" label="Novos seguidores" value="+1.284" detail="+22,1% no período" positive />
      </section>

      <section className="analytics-grid">
        <div className="panel chart-panel">
          <PanelHeader eyebrow="EVOLUÇÃO" title="Visualizações por publicação" action="Ver detalhes" />
          <div className="chart-total"><strong>128.420</strong><span><TrendingUp size={14} /> 18,2%</span><small>vs. período anterior</small></div>
          <div className="bar-chart">{bars.map((height, index) => <div key={index} className={index === 11 ? "highlight" : ""}><span style={{ height: `${height}%` }} /><small>{index % 2 === 0 ? `${index + 3}/07` : ""}</small></div>)}</div>
        </div>
        <div className="panel insight-panel">
          <div className="insight-heading"><span className="panel-icon"><Sparkles size={18} /></span><div><span className="eyebrow">INSIGHT DO MAPA</span><h2>Seu padrão vencedor</h2></div></div>
          <p className="insight-lead">Conteúdos que <strong>abrem com uma pergunta clínica</strong> geraram 2,4× mais salvamentos.</p>
          <div className="insight-proof"><span><Bookmark size={17} /> Salvamentos médios</span><strong>642</strong><small>vs. 268 nos demais</small></div>
          <div className="next-action"><Lightbulb size={18} /><p><strong>Próxima ação</strong>Comece o próximo Reel com: “O que a balança não está mostrando?”</p></div>
          <button className="button secondary full"><PencilLine size={17} /> Criar roteiro a partir deste insight</button>
        </div>
      </section>

      <section className="panel top-content-panel">
        <PanelHeader eyebrow="RANKING" title="Conteúdos com melhor desempenho" action="Exportar relatório" />
        <div className="ranking-table">
          <div className="ranking-row ranking-head"><span>Conteúdo</span><span>Visualizações</span><span>Retenção</span><span>Interações</span><span>Nota MAPA</span></div>
          {[
            ["Proteína depois dos 60", "Reel · 01 ago", "42,8 mil", "71%", "3.842", "9,4"],
            ["Creatina: o mito dos rins", "Reel · 27 jul", "31,2 mil", "68%", "2.915", "9,1"],
            ["O que a balança não mostra", "Carrossel · 24 jul", "18,6 mil", "62%", "2.104", "8,7"],
          ].map((row, index) => (
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

function PanelHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action && <button className="text-button" onClick={onAction}>{action}<ChevronRight size={16} /></button>}</div>;
}

function EmptyMini({ text }: { text: string }) {
  return <div className="empty-mini"><CalendarDays size={20} /><span>{text}</span></div>;
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-layer"><button className="backdrop" aria-label="Fechar janela" onClick={onClose} /><div className={`modal-card ${wide ? "wide" : ""}`} role="dialog" aria-modal="true"><button className="modal-close" aria-label="Fechar" onClick={onClose}><X size={20} /></button>{children}</div></div>;
}
