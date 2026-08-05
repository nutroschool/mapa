"use client";

import {
  BarChart3,
  Eye,
  Heart,
  Instagram,
  Lightbulb,
  LoaderCircle,
  Play,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { InstagramAccount, InstagramMetrics } from "@/lib/instagram";

type Props = {
  account: InstagramAccount | null;
  metrics: InstagramMetrics | null;
  loading: boolean;
  period: 30 | 90;
  onPeriodChange: (period: 30 | 90) => void;
  onRefresh: () => void;
  onNotify: (message: string) => void;
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function Metric({
  icon,
  tone,
  label,
  value,
  detail,
  positive,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <article className="metric-card">
      <span className={"metric-icon " + tone}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p className={positive ? "positive" : ""}>{positive && <TrendingUp size={13} />} {detail}</p>
      </div>
    </article>
  );
}

export default function InstagramPerformance({
  account,
  metrics,
  loading,
  period,
  onPeriodChange,
  onRefresh,
  onNotify,
}: Props) {
  const currentAccount = metrics?.account || account;
  const media = metrics?.media || [];
  const bestMedia = media[0];
  const chartMedia = [...media].reverse().slice(-12);
  const maxViews = Math.max(...chartMedia.map((item) => item.views), 1);
  const syncedAt = metrics?.synced_at
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(metrics.synced_at))
    : "aguardando primeira sincronização";

  function exportReport() {
    if (!metrics) return;
    const rows = [
      ["Conteúdo", "Data", "Visualizações", "Alcance", "Interações", "Curtidas", "Comentários", "Compartilhamentos", "Salvamentos", "Link"],
      ...metrics.media.map((item) => [
        item.caption.replace(/\s+/g, " ").trim(),
        item.timestamp,
        String(item.views),
        String(item.reach),
        String(item.interactions),
        String(item.likes),
        String(item.comments),
        String(item.shares),
        String(item.saved),
        item.permalink,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mapa-instagram-" + metrics.period_days + "-dias.csv";
    link.click();
    URL.revokeObjectURL(url);
    onNotify("Relatório real do Instagram exportado.");
  }

  return (
    <>
      <section className="panel connected-instagram-banner">
        <span
          className="instagram-account-avatar"
          style={currentAccount?.profile_picture_url
            ? { backgroundImage: "url(" + currentAccount.profile_picture_url + ")", backgroundSize: "cover" }
            : undefined}
          aria-hidden="true"
        >
          {!currentAccount?.profile_picture_url && <Instagram size={25} />}
        </span>
        <div>
          <span className="eyebrow">INSTAGRAM CONECTADO</span>
          <h2>@{currentAccount?.username || "conta profissional"}</h2>
          <p>Dados oficiais da conta {currentAccount?.account_type?.toLowerCase() || "profissional"} · última sincronização: {syncedAt}</p>
        </div>
        <button className="button secondary" disabled={loading} onClick={onRefresh}>
          {loading ? <LoaderCircle className="spin" size={17} /> : <BarChart3 size={17} />}
          {loading ? "Sincronizando..." : "Atualizar métricas"}
        </button>
      </section>

      <section className="analytics-head">
        <div className="period-tabs">
          <button className={period === 30 ? "active" : ""} onClick={() => onPeriodChange(30)}>Últimos 30 dias</button>
          <button className={period === 90 ? "active" : ""} onClick={() => onPeriodChange(90)}>90 dias</button>
        </div>
        <span className="sync-state live"><span /> API oficial da Meta</span>
      </section>

      <section className="metrics-grid analytics-metrics">
        <Metric icon={<Eye size={19} />} tone="lime" label="Visualizações" value={compactNumber(metrics?.summary.views || 0)} detail={media.length + " conteúdos analisados"} positive={Boolean(metrics?.summary.views)} />
        <Metric icon={<Users size={19} />} tone="blue" label="Alcance acumulado" value={compactNumber(metrics?.summary.reach || 0)} detail={"Conteúdos dos últimos " + period + " dias"} positive={Boolean(metrics?.summary.reach)} />
        <Metric icon={<Heart size={19} />} tone="coral" label="Engajamento" value={(metrics?.summary.engagement || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%"} detail={compactNumber(metrics?.summary.interactions || 0) + " interações"} positive={Boolean(metrics?.summary.interactions)} />
        <Metric icon={<TrendingUp size={19} />} tone="violet" label="Seguidores atuais" value={compactNumber(metrics?.account.followers || 0)} detail={(metrics?.account.media_count || 0) + " publicações na conta"} />
      </section>

      {loading && !metrics ? (
        <section className="panel empty-analytics integration-loading" aria-busy="true">
          <LoaderCircle className="spin" size={30} />
          <h2>Importando suas métricas</h2>
          <p>O MAPA está consultando seus conteúdos autorizados na API oficial.</p>
        </section>
      ) : (
        <>
          <section className="analytics-grid">
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">EVOLUÇÃO</span><h2>Visualizações por conteúdo</h2></div>
                <button onClick={onRefresh}>Atualizar <ArrowIcon /></button>
              </div>
              <div className="chart-total"><strong>{compactNumber(metrics?.summary.views || 0)}</strong><small>visualizações no período</small></div>
              {chartMedia.length ? (
                <div className="bar-chart">
                  {chartMedia.map((item, index) => (
                    <div key={item.id} className={index === chartMedia.length - 1 ? "highlight" : ""}>
                      <span style={{ height: Math.max(7, (item.views / maxViews) * 100) + "%" }} />
                      <small>{index + 1}</small>
                    </div>
                  ))}
                </div>
              ) : <div className="chart-empty">Nenhum conteúdo publicado neste período.</div>}
            </div>

            <div className="panel insight-panel">
              <div className="insight-heading"><span className="panel-icon"><Sparkles size={18} /></span><div><span className="eyebrow">LEITURA DO MAPA</span><h2>{bestMedia ? "Conteúdo de maior alcance" : "Aguardando dados"}</h2></div></div>
              {bestMedia ? (
                <>
                  <p className="insight-lead"><strong>{bestMedia.caption.slice(0, 125) || "Conteúdo sem legenda"}</strong></p>
                  <div className="insight-proof"><span><Eye size={17} /> Visualizações</span><strong>{compactNumber(bestMedia.views)}</strong><small>{compactNumber(bestMedia.reach)} de alcance</small></div>
                  <div className="next-action"><Lightbulb size={18} /><p><strong>Próxima leitura</strong>Compare o gancho, o formato e o tema deste conteúdo com os próximos colocados.</p></div>
                </>
              ) : (
                <p className="insight-lead">Publique um conteúdo ou selecione um período maior para começar a comparar padrões reais.</p>
              )}
              <button className="button secondary full" disabled={loading} onClick={onRefresh}><BarChart3 size={17} /> Recalcular análise</button>
            </div>
          </section>

          <section className="panel top-content-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">DADOS REAIS</span><h2>Conteúdos com melhor desempenho</h2></div>
              <button onClick={exportReport}>Exportar relatório <ArrowIcon /></button>
            </div>
            {media.length ? (
              <div className="ranking-table">
                <div className="ranking-row ranking-head"><span>Conteúdo</span><span>Visualizações</span><span>Alcance</span><span>Interações</span><span>Engajamento</span></div>
                {media.slice(0, 6).map((item, index) => {
                  const engagement = item.reach > 0 ? (item.interactions / item.reach) * 100 : 0;
                  return (
                    <div className="ranking-row" key={item.id}>
                      <span className="rank-title"><em>{String(index + 1).padStart(2, "0")}</em><i className="rank-thumb thumb-1"><Play size={15} /></i><span><strong>{item.caption.slice(0, 72) || "Conteúdo sem legenda"}</strong><small>{new Intl.DateTimeFormat("pt-BR").format(new Date(item.timestamp))} · {item.media_type}</small></span></span>
                      <span>{compactNumber(item.views)}</span>
                      <span>{compactNumber(item.reach)}</span>
                      <span className="interaction-icons"><Heart size={14} /> {compactNumber(item.interactions)}</span>
                      <span className="mapa-score"><Sparkles size={14} /> {engagement.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                    </div>
                  );
                })}
              </div>
            ) : <div className="chart-empty ranking-empty">Nenhum conteúdo encontrado nos últimos {period} dias.</div>}
          </section>
        </>
      )}
    </>
  );
}

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}
