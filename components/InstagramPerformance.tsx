"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  Eye,
  Heart,
  Instagram,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  Play,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { InstagramAccount, InstagramMediaMetric, InstagramMetrics } from "@/lib/instagram";

type Props = {
  account: InstagramAccount | null;
  metrics: InstagramMetrics | null;
  loading: boolean;
  period: 30 | 90;
  demo?: boolean;
  onPeriodChange: (period: 30 | 90) => void;
  onRefresh: () => void;
  onNotify: (message: string) => void;
  onCreateFromPost?: (media: InstagramMediaMetric) => void;
  onExitDemo?: () => void;
};

type Benchmarks = {
  views: number;
  reach: number;
  engagementRate: number;
  saveRate: number;
  shareRate: number;
  commentRate: number;
};

type PostAnalysis = {
  engagementRate: number;
  saveRate: number;
  shareRate: number;
  commentRate: number;
  score: number;
  verdict: string;
  verdictTone: "strong" | "attention" | "steady";
  worked: string[];
  limited: string[];
  nextActions: string[];
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function percent(value: number, digits = 1) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rate(value: number, base: number) {
  return base > 0 ? (value / base) * 100 : 0;
}

function ratio(value: number, reference: number) {
  if (reference <= 0) return value > 0 ? 1.35 : 1;
  return value / reference;
}

function relativeText(value: number, reference: number) {
  if (reference <= 0) return value > 0 ? "acima da base disponível" : "sem base comparável";
  const difference = ((value / reference) - 1) * 100;
  return `${Math.abs(difference).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% ${difference >= 0 ? "acima" : "abaixo"} da mediana`;
}

function buildBenchmarks(media: InstagramMediaMetric[]): Benchmarks {
  return {
    views: median(media.map((item) => item.views)),
    reach: median(media.map((item) => item.reach)),
    engagementRate: median(media.map((item) => rate(item.interactions, item.reach))),
    saveRate: median(media.map((item) => rate(item.saved, item.reach))),
    shareRate: median(media.map((item) => rate(item.shares, item.reach))),
    commentRate: median(media.map((item) => rate(item.comments, item.reach))),
  };
}

function analyzePost(item: InstagramMediaMetric, benchmarks: Benchmarks): PostAnalysis {
  const engagementRate = rate(item.interactions, item.reach);
  const saveRate = rate(item.saved, item.reach);
  const shareRate = rate(item.shares, item.reach);
  const commentRate = rate(item.comments, item.reach);
  const viewRatio = ratio(item.views, benchmarks.views);
  const engagementRatio = ratio(engagementRate, benchmarks.engagementRate);
  const saveRatio = ratio(saveRate, benchmarks.saveRate);
  const shareRatio = ratio(shareRate, benchmarks.shareRate);
  const score = Math.round(Math.max(0, Math.min(100,
    50 * (viewRatio * .34 + engagementRatio * .28 + saveRatio * .22 + shareRatio * .16),
  )));
  const worked: string[] = [];
  const limited: string[] = [];
  const nextActions: string[] = [];

  if (viewRatio >= 1.15) worked.push(`Distribuição forte: ${relativeText(item.views, benchmarks.views)} em visualizações.`);
  if (engagementRatio >= 1.15) worked.push(`Resposta do público acima do padrão: engajamento de ${percent(engagementRate)}.`);
  if (saveRatio >= 1.2 && item.saved > 0) worked.push(`Valor de consulta: taxa de salvamento de ${percent(saveRate, 2)}, acima do padrão da conta.`);
  if (shareRatio >= 1.2 && item.shares > 0) worked.push(`Boa capacidade de circulação: ${item.shares} compartilhamentos, ${relativeText(shareRate, benchmarks.shareRate)}.`);
  if (ratio(commentRate, benchmarks.commentRate) >= 1.2 && item.comments > 0) worked.push(`Gerou conversa: comentários proporcionalmente acima da mediana.`);
  if (!worked.length) worked.push("O post ficou próximo do comportamento típico da conta, sem um pico isolado nas métricas disponíveis.");

  if (viewRatio < .8) {
    limited.push(`Visualizações ${relativeText(item.views, benchmarks.views)}; a distribuição inicial ficou abaixo do padrão recente.`);
    nextActions.push("Teste uma promessa mais específica na primeira frase e uma capa que explicite o benefício.");
  }
  if (engagementRatio < .8) {
    limited.push(`Engajamento de ${percent(engagementRate)}, abaixo da mediana de ${percent(benchmarks.engagementRate)}.`);
    nextActions.push("Encurte a introdução e entregue o primeiro ponto útil antes de aprofundar a explicação.");
  }
  if (saveRatio < .75) {
    limited.push(`Pouca intenção de consulta futura: salvamentos em ${percent(saveRate, 2)} do alcance.`);
    nextActions.push("Inclua checklist, passo a passo, dose, critério ou resumo que valha rever depois.");
  }
  if (shareRatio < .75) {
    limited.push(`Compartilhamento abaixo do padrão: ${percent(shareRate, 2)} do alcance.`);
    nextActions.push("Enquadre o conteúdo para uma pessoa concreta: “envie para quem...” ou “isso interessa a quem...”.");
  }
  if (ratio(commentRate, benchmarks.commentRate) < .75) {
    nextActions.push("Feche com uma pergunta simples e opinável para abrir conversa, sem depender de resposta clínica individual.");
  }
  if (!limited.length) limited.push("Nenhum ponto ficou materialmente abaixo da mediana; o próximo ganho tende a vir de repetir o formato e testar novos temas.");
  if (!nextActions.length) nextActions.push("Repita a estrutura do gancho e o tipo de entrega em uma pauta adjacente para confirmar o padrão.");

  const verdict = score >= 75 ? "Padrão vencedor" : score < 45 ? "Precisa de ajuste" : "Desempenho consistente";
  return {
    engagementRate,
    saveRate,
    shareRate,
    commentRate,
    score,
    verdict,
    verdictTone: score >= 75 ? "strong" : score < 45 ? "attention" : "steady",
    worked: worked.slice(0, 3),
    limited: limited.slice(0, 3),
    nextActions: nextActions.slice(0, 3),
  };
}

function Metric({ icon, tone, label, value, detail, positive }: { icon: ReactNode; tone: string; label: string; value: string; detail: string; positive?: boolean }) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><p className={positive ? "positive" : ""}>{positive && <TrendingUp size={13} />} {detail}</p></div>
    </article>
  );
}

export default function InstagramPerformance({ account, metrics, loading, period, demo = false, onPeriodChange, onRefresh, onNotify, onCreateFromPost, onExitDemo }: Props) {
  const currentAccount = metrics?.account || account;
  const media = useMemo(() => metrics?.media || [], [metrics?.media]);
  const benchmarks = useMemo(() => buildBenchmarks(media), [media]);
  const analyses = useMemo(() => new Map(media.map((item) => [item.id, analyzePost(item, benchmarks)])), [benchmarks, media]);
  const rankedMedia = useMemo(() => [...media].sort((first, second) => (analyses.get(second.id)?.score || 0) - (analyses.get(first.id)?.score || 0)), [analyses, media]);
  const bestMedia = rankedMedia[0];
  const weakestMedia = rankedMedia.at(-1);
  const mostSaved = [...media].sort((first, second) => rate(second.saved, second.reach) - rate(first.saved, first.reach))[0];
  const mostShared = [...media].sort((first, second) => rate(second.shares, second.reach) - rate(first.shares, first.reach))[0];
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const selectedMedia = media.find((item) => item.id === selectedMediaId) || null;
  const selectedAnalysis = selectedMedia ? analyses.get(selectedMedia.id) || null : null;
  const chartMedia = [...media].reverse().slice(-12);
  const maxViews = Math.max(...chartMedia.map((item) => item.views), 1);
  const syncedAt = metrics?.synced_at
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(metrics.synced_at))
    : "aguardando primeira sincronização";

  function exportReport() {
    if (!metrics) return;
    const rows = [
      ["Conteúdo", "Data", "Visualizações", "Alcance", "Interações", "Curtidas", "Comentários", "Compartilhamentos", "Salvamentos", "Engajamento", "Taxa de salvamento", "Taxa de compartilhamento", "Nota MAPA", "Diagnóstico", "Link"],
      ...metrics.media.map((item) => {
        const analysis = analyses.get(item.id)!;
        return [item.caption.replace(/\s+/g, " ").trim(), item.timestamp, String(item.views), String(item.reach), String(item.interactions), String(item.likes), String(item.comments), String(item.shares), String(item.saved), percent(analysis.engagementRate), percent(analysis.saveRate, 2), percent(analysis.shareRate, 2), String(analysis.score), analysis.verdict, item.permalink];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mapa-instagram-${metrics.period_days}-dias.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onNotify(demo ? "Relatório demonstrativo exportado." : "Relatório real do Instagram exportado.");
  }

  return (
    <>
      {demo && <div className="demo-banner"><span><Sparkles size={16} /> Modo demonstração</span><p>Os números e diagnósticos abaixo são exemplos, não dados da sua conta.</p>{onExitDemo && <button onClick={onExitDemo}>Sair da demonstração <X size={15} /></button>}</div>}

      <section className="panel connected-instagram-banner">
        <span className="instagram-account-avatar" aria-hidden="true"><Instagram size={25} /></span>
        <div>
          <span className="eyebrow">{demo ? "CONTA DE EXEMPLO" : "INSTAGRAM CONECTADO"}</span>
          <h2>@{currentAccount?.username || "conta profissional"}</h2>
          <p>{demo ? "Diagnóstico completo para você explorar o fluxo" : `Dados oficiais da conta ${currentAccount?.account_type?.toLowerCase() || "profissional"} · última sincronização: ${syncedAt}`}</p>
        </div>
        <button className="button secondary" disabled={loading} onClick={onRefresh}>{loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}{loading ? "Sincronizando..." : "Atualizar análise"}</button>
      </section>

      <section className="analytics-head">
        <div className="period-tabs"><button className={period === 30 ? "active" : ""} onClick={() => onPeriodChange(30)}>Últimos 30 dias</button><button className={period === 90 ? "active" : ""} onClick={() => onPeriodChange(90)}>90 dias</button></div>
        <span className={`sync-state ${demo ? "demo" : "live"}`}><span /> {demo ? "Dados de demonstração" : "API oficial da Meta"}</span>
      </section>

      <section className="metrics-grid analytics-metrics">
        <Metric icon={<Eye size={19} />} tone="lime" label="Visualizações" value={compactNumber(metrics?.summary.views || 0)} detail={`${media.length} conteúdos analisados`} positive={Boolean(metrics?.summary.views)} />
        <Metric icon={<Users size={19} />} tone="blue" label="Alcance acumulado" value={compactNumber(metrics?.summary.reach || 0)} detail={`Últimos ${period} dias`} positive={Boolean(metrics?.summary.reach)} />
        <Metric icon={<Heart size={19} />} tone="coral" label="Engajamento" value={percent(metrics?.summary.engagement || 0, 2)} detail={`${compactNumber(metrics?.summary.interactions || 0)} interações`} positive={Boolean(metrics?.summary.interactions)} />
        <Metric icon={<Bookmark size={19} />} tone="violet" label="Salvamentos" value={compactNumber(media.reduce((sum, item) => sum + item.saved, 0))} detail={`Mediana: ${percent(benchmarks.saveRate, 2)} do alcance`} positive={media.some((item) => item.saved > 0)} />
      </section>

      {loading && !metrics ? (
        <section className="panel empty-analytics integration-loading" aria-busy="true"><LoaderCircle className="spin" size={30} /><h2>Importando suas métricas</h2><p>O MAPA está consultando seus conteúdos autorizados na API oficial.</p></section>
      ) : (
        <>
          <section className="performance-diagnosis-grid">
            <article className="panel diagnosis-card worked"><span><Trophy size={18} /></span><div><small>O QUE FUNCIONOU</small><h3>{bestMedia ? bestMedia.caption.slice(0, 74) : "Aguardando dados"}</h3><p>{bestMedia ? analyses.get(bestMedia.id)?.worked[0] : "Amplie o período ou publique um conteúdo para iniciar a comparação."}</p></div></article>
            <article className="panel diagnosis-card improve"><span><AlertTriangle size={18} /></span><div><small>O QUE PODE MELHORAR</small><h3>{weakestMedia ? weakestMedia.caption.slice(0, 74) : "Aguardando dados"}</h3><p>{weakestMedia ? analyses.get(weakestMedia.id)?.limited[0] : "Ainda não há uma amostra suficiente para localizar gargalos."}</p></div></article>
            <article className="panel diagnosis-card repeat"><span><Target size={18} /></span><div><small>PADRÃO A REPETIR</small><h3>{mostSaved ? "Conteúdo que as pessoas guardam" : "Aguardando dados"}</h3><p>{mostSaved ? `“${mostSaved.caption.slice(0, 60)}” teve a melhor taxa de salvamento. Reaproveite o tipo de entrega, não apenas o tema.` : "As taxas de intenção aparecerão aqui."}</p></div></article>
          </section>

          <section className="analytics-grid detailed-analytics-grid">
            <div className="panel chart-panel">
              <div className="panel-heading"><div><span className="eyebrow">DISTRIBUIÇÃO</span><h2>Visualizações por publicação</h2></div><button onClick={onRefresh}>Atualizar <ArrowUpRight size={14} /></button></div>
              <div className="chart-total"><strong>{compactNumber(metrics?.summary.views || 0)}</strong><small>visualizações no período · mediana {compactNumber(benchmarks.views)}</small></div>
              {chartMedia.length ? <div className="bar-chart">{chartMedia.map((item) => <button key={item.id} className={item.id === bestMedia?.id ? "highlight" : ""} aria-label={`Analisar ${item.caption.slice(0, 45)}`} onClick={() => setSelectedMediaId(item.id)}><span style={{ height: `${Math.max(7, (item.views / maxViews) * 100)}%` }} /><small>{new Date(item.timestamp).getDate()}</small></button>)}</div> : <div className="chart-empty">Nenhum conteúdo publicado neste período.</div>}
            </div>

            <div className="panel intent-panel">
              <div className="insight-heading"><span className="panel-icon"><Sparkles size={18} /></span><div><span className="eyebrow">INTENÇÃO DO PÚBLICO</span><h2>Além das curtidas</h2></div></div>
              <div className="intent-comparison"><span><Bookmark size={16} /> Mais salvo<strong>{mostSaved ? percent(rate(mostSaved.saved, mostSaved.reach), 2) : "0%"}</strong><small>{mostSaved?.caption.slice(0, 55) || "Sem dados"}</small></span><span><Share2 size={16} /> Mais compartilhado<strong>{mostShared ? percent(rate(mostShared.shares, mostShared.reach), 2) : "0%"}</strong><small>{mostShared?.caption.slice(0, 55) || "Sem dados"}</small></span></div>
              <div className="analysis-caveat"><Lightbulb size={16} /><p>Esta leitura compara resultados da sua própria conta. Ela sugere hipóteses para teste; não prova que gancho, tema ou formato causaram o desempenho.</p></div>
            </div>
          </section>

          <section className="panel top-content-panel detailed-ranking-panel">
            <div className="panel-heading"><div><span className="eyebrow">POST A POST</span><h2>Diagnóstico detalhado das publicações</h2><p>Clique em um conteúdo para entender seus pontos fortes e fracos.</p></div><button onClick={exportReport}>Exportar relatório <ArrowUpRight size={14} /></button></div>
            {rankedMedia.length ? (
              <div className="ranking-table detailed-ranking">
                <div className="ranking-row ranking-head"><span>Conteúdo</span><span>Views × mediana</span><span>Salvos</span><span>Compart.</span><span>Nota MAPA</span></div>
                {rankedMedia.slice(0, 12).map((item, index) => {
                  const analysis = analyses.get(item.id)!;
                  return <button className={`ranking-row ranking-item ${selectedMediaId === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelectedMediaId(item.id)}><span className="rank-title"><em>{String(index + 1).padStart(2, "0")}</em><i className="rank-thumb"><Play size={15} /></i><span><strong>{item.caption.slice(0, 72) || "Conteúdo sem legenda"}</strong><small>{new Intl.DateTimeFormat("pt-BR").format(new Date(item.timestamp))} · {item.media_type} · {analysis.verdict}</small></span></span><span className={item.views >= benchmarks.views ? "positive-number" : "negative-number"}>{relativeText(item.views, benchmarks.views)}</span><span><Bookmark size={13} /> {compactNumber(item.saved)}<small>{percent(analysis.saveRate, 2)}</small></span><span><Share2 size={13} /> {compactNumber(item.shares)}<small>{percent(analysis.shareRate, 2)}</small></span><span className={`mapa-score ${analysis.verdictTone}`}><Sparkles size={14} /> {analysis.score}</span></button>;
                })}
              </div>
            ) : <div className="chart-empty ranking-empty">Nenhum conteúdo encontrado nos últimos {period} dias.</div>}
          </section>

          {selectedMedia && selectedAnalysis && (
            <section className="panel post-analysis-panel" aria-live="polite">
              <div className="post-analysis-head"><div><span className="eyebrow">ANÁLISE ABERTA</span><h2>{selectedMedia.caption.slice(0, 120) || "Conteúdo sem legenda"}</h2><p>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(selectedMedia.timestamp))} · {selectedMedia.media_type}</p></div><button className="icon-button" aria-label="Fechar análise" onClick={() => setSelectedMediaId("")}><X size={19} /></button></div>
              <div className="post-analysis-score"><span className={`score-ring ${selectedAnalysis.verdictTone}`}><strong>{selectedAnalysis.score}</strong><small>/100</small></span><span><small>DIAGNÓSTICO MAPA</small><strong>{selectedAnalysis.verdict}</strong><p>Comparação com a mediana dos {media.length} posts disponíveis no período.</p></span></div>
              <div className="post-metrics-strip"><span><Eye size={16} /><small>Visualizações</small><strong>{compactNumber(selectedMedia.views)}</strong></span><span><Users size={16} /><small>Alcance</small><strong>{compactNumber(selectedMedia.reach)}</strong></span><span><Heart size={16} /><small>Engajamento</small><strong>{percent(selectedAnalysis.engagementRate)}</strong></span><span><Bookmark size={16} /><small>Salvamento</small><strong>{percent(selectedAnalysis.saveRate, 2)}</strong></span><span><Share2 size={16} /><small>Compartilhamento</small><strong>{percent(selectedAnalysis.shareRate, 2)}</strong></span><span><MessageCircle size={16} /><small>Comentários</small><strong>{percent(selectedAnalysis.commentRate, 2)}</strong></span></div>
              <div className="post-analysis-columns">
                <article><span className="analysis-list-title good"><CheckCircle2 size={17} /> O que foi bom</span>{selectedAnalysis.worked.map((item) => <p key={item}>{item}</p>)}</article>
                <article><span className="analysis-list-title weak"><AlertTriangle size={17} /> O que segurou o post</span>{selectedAnalysis.limited.map((item) => <p key={item}>{item}</p>)}</article>
                <article><span className="analysis-list-title action"><Lightbulb size={17} /> Próximo teste</span>{selectedAnalysis.nextActions.map((item) => <p key={item}>{item}</p>)}</article>
              </div>
              <div className="post-analysis-actions">{selectedMedia.permalink && <a className="button ghost" href={selectedMedia.permalink} target="_blank" rel="noreferrer">Abrir no Instagram <ArrowUpRight size={16} /></a>}{onCreateFromPost && <button className="button primary" onClick={() => onCreateFromPost(selectedMedia)}><Sparkles size={16} /> Criar nova pauta deste aprendizado</button>}</div>
            </section>
          )}
        </>
      )}
    </>
  );
}
