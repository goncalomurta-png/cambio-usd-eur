// ── Geração do relatório HTML ──────────────────────────────────

function gerarRelatorio(r) {
  secDecisao(r);
  secContexto(r);
  secNumeros(r);
  guardarArquivo(r);
  verificarAlerta();
}

// ═══════════════════════════════════════════════════════════════
// SECÇÃO 1 — DECISÃO  (o que fazer + quando + porquê)
// ═══════════════════════════════════════════════════════════════
function secDecisao(r) {
  const rec  = r.recomendacao;
  const dMax = addDias(r.hoje, r.flexibilidade);

  // Bloco central: EUR hoje + próxima janela + limite
  let acaoHTML = '';

  if (rec.decisao === 'CONVERTER AGORA') {
    acaoHTML = `
      <div class="acao-bloco acao-converter">
        <div class="acao-label">Recebes hoje na Wise</div>
        <div class="acao-valor">€${fmtEUR(r.eurHoje)}</div>
        <div class="acao-sub">à taxa ${r.wise.taxa.toFixed(5)} · fee $${r.wise.fee.toFixed(2)}</div>
      </div>`;

  } else if (rec.decisao === 'AGUARDAR') {
    const proximaHTML = r.proximaOtima
      ? `<div class="acao-otima">Melhor janela: <strong>dias ${r.proximaOtima.janela}</strong> — em <strong>${r.proximaOtima.dias} dias</strong> (${fmtData(r.proximaOtima.data)})</div>`
      : '';
    acaoHTML = `
      <div class="acao-bloco acao-aguardar">
        <div class="acao-label">Hoje receberias</div>
        <div class="acao-valor dimmed">€${fmtEUR(r.eurHoje)}</div>
        ${proximaHTML}
        <div class="acao-limite">Limite: converte até <strong>${fmtData(dMax)}</strong> independentemente da taxa</div>
      </div>`;

  } else { // CONVERSÃO PARCIAL
    const p25 = r.montante * 0.25, p50 = r.montante * 0.50, p75 = r.montante * 0.75;
    const fee  = r.wise.fee;
    acaoHTML = `
      <div class="acao-bloco acao-parcial">
        <div class="acao-label">Converte agora uma parte (escolhe)</div>
        <div class="parciais-row">
          <div class="p-opt">
            <div class="p-pct">25%</div>
            <div class="p-usd">$${fmt(p25)}</div>
            <div class="p-eur">€${fmtEUR(eurAtaxa(r.wise.taxa, fee * 0.25, p25))}</div>
          </div>
          <div class="p-opt p-destaque">
            <div class="p-pct">50% ★</div>
            <div class="p-usd">$${fmt(p50)}</div>
            <div class="p-eur">€${fmtEUR(eurAtaxa(r.wise.taxa, fee * 0.50, p50))}</div>
          </div>
          <div class="p-opt">
            <div class="p-pct">75%</div>
            <div class="p-usd">$${fmt(p75)}</div>
            <div class="p-eur">€${fmtEUR(eurAtaxa(r.wise.taxa, fee * 0.75, p75))}</div>
          </div>
        </div>
        <div class="acao-limite">Aguarda com o restante até <strong>${fmtData(dMax)}</strong></div>
      </div>`;
  }

  // 3 razões mais relevantes
  const razoes3 = rec.razoes.slice(0, 3);

  document.getElementById('decisao').innerHTML = `
    <div class="rec-badge ${rec.classe}">${rec.emoji} ${rec.decisao}</div>
    ${acaoHTML}
    <ul class="razoes-curtas">
      ${razoes3.map(x => `<li>${x}</li>`).join('')}
    </ul>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SECÇÃO 2 — CONTEXTO  (mercado + fluxos mensais)
// ═══════════════════════════════════════════════════════════════
function secContexto(r) {
  // Sparkline 30 dias
  const hist  = r.historico;
  const taxas = hist.map(d => d.taxa);
  const min   = Math.min(...taxas), max = Math.max(...taxas);
  const range = max - min || 0.001;
  const slice = hist.slice(-30);
  const bars  = slice.map((d, i) => {
    const h = Math.round(((d.taxa - min) / range) * 48 + 6);
    return `<div class="s-bar${i === slice.length - 1 ? ' hoje' : ''}" style="height:${h}px" title="${d.data}: ${d.taxa}"></div>`;
  }).join('');
  const var30 = taxas.length >= 30
    ? ((taxas[taxas.length - 1] - taxas[taxas.length - 30]) / taxas[taxas.length - 30] * 100)
    : 0;

  // Sinal técnico resumido (1 linha)
  const rsiLabel  = !r.rsi ? '—' : r.rsi > 70 ? `RSI ${r.rsi.toFixed(0)} sobrecomprado ↓` : r.rsi < 30 ? `RSI ${r.rsi.toFixed(0)} sobrevendido ↑` : `RSI ${r.rsi.toFixed(0)} neutro`;
  const macdLabel = !r.macd ? '' : r.macd.sinalCruz === 'alta' ? ' · MACD cruzamento ↑' : r.macd.sinalCruz === 'baixa' ? ' · MACD cruzamento ↓' : ` · MACD ${r.macd.histograma > 0 ? 'positivo' : 'negativo'}`;
  const bollPos   = r.bollinger ? (r.bollinger.taxa - r.bollinger.inferior) / (r.bollinger.superior - r.bollinger.inferior) : 0.5;
  const bollLabel = bollPos > 0.80 ? ' · Bollinger banda sup.' : bollPos < 0.20 ? ' · Bollinger banda inf.' : ' · Bollinger central';
  const techSinal = rsiLabel + macdLabel + bollLabel;

  // Fluxos mensais — mini barras
  const janelas = ['1-5', '6-10', '11-15', '16-20', '21-25', '26-31'];
  const probs   = janelas.map(j => r.probJanelas[j] || 0);
  const maxProb = Math.max(...probs, 1);
  const fluxoBars = janelas.map((j, idx) => {
    const prob    = probs[idx];
    const isAtual = j === r.janela;
    const isOtima = r.proximaOtima?.janela === j;
    const barH    = Math.round((prob / maxProb) * 40 + 4);
    const cls     = isAtual ? 'fb-atual' : isOtima ? 'fb-otima' : prob >= 30 ? 'fb-bom' : 'fb-fraco';
    return `
      <div class="flux-col" title="Dias ${j}: ${prob.toFixed(1)}%${isAtual ? ' (hoje)' : ''}${isOtima ? ' (melhor)' : ''}">
        <div class="flux-bar ${cls}" style="height:${barH}px"></div>
        <div class="flux-dia">${j.split('-')[0]}</div>
      </div>`;
  }).join('');

  const fluxoTexto = r.proximaOtima
    ? `Hoje: dias ${r.janela} · ${(r.probJanelas[r.janela] || 0).toFixed(1)}% &nbsp;→&nbsp; Melhor: dias ${r.proximaOtima.janela} em ${r.proximaOtima.dias} dias · ${r.proximaOtima.prob.toFixed(1)}%`
    : `Hoje: dias ${r.janela} · ${(r.probJanelas[r.janela] || 0).toFixed(1)}% — sem janela significativamente melhor nos próximos ${r.flexibilidade} dias`;

  document.getElementById('contexto').innerHTML = `
    <div class="contexto-grid">
      <div class="ctx-esq">
        <div class="ctx-metricas">
          <div class="ctx-m">
            <span class="ctx-label">Taxa BCE</span>
            <span class="ctx-val">${r.taxaAtual.toFixed(5)}</span>
          </div>
          <div class="ctx-m">
            <span class="ctx-label">30 dias</span>
            <span class="ctx-val ${var30 >= 0 ? 'pos' : 'neg'}">${var30 >= 0 ? '+' : ''}${var30.toFixed(2)}%</span>
          </div>
          <div class="ctx-m">
            <span class="ctx-label">Volatilidade</span>
            <span class="ctx-val">${r.volPct.toFixed(2)}%</span>
          </div>
        </div>
        <div class="sparkline">${bars}</div>
        <div class="sparkline-footer">
          <span>${slice[0]?.data || ''}</span><span>Hoje (${r.taxaAtual.toFixed(4)})</span>
        </div>
        <p class="tech-sinal">${techSinal}</p>
      </div>

      <div class="ctx-dir">
        <div class="flux-titulo">Fluxos mensais — ${r.mesNome}</div>
        <div class="flux-legend">
          <span class="fl-item"><span class="fl-dot fb-atual"></span>Hoje</span>
          ${r.proximaOtima ? `<span class="fl-item"><span class="fl-dot fb-otima"></span>Melhor</span>` : ''}
        </div>
        <div class="flux-bars">${fluxoBars}</div>
        <p class="flux-texto">${fluxoTexto}</p>
        <p class="flux-nota">Padrão histórico BCE 1999-2026 · ciclos de pagamentos empresariais mensais</p>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SECÇÃO 3 — NÚMEROS  (taxas + break-even + macro)
// ═══════════════════════════════════════════════════════════════
function secNumeros(r) {
  // Tempo para recuperar a fee da Wise com juros simples
  const feeUSD       = r.wise.fee;
  const feeEUR       = feeUSD * r.wise.taxa;                          // aprox. custo em EUR
  const diasRecUSD   = feeUSD > 0 ? Math.ceil(feeUSD / (r.montante * (r.juroUSD / 100) / 365)) : 0;
  const eurRecebido  = r.eurHoje;
  const diasRecEUR   = feeEUR > 0 ? Math.ceil(feeEUR / (eurRecebido * (r.juroEUR / 100) / 365)) : 0;

  const feeTextoUSD = diasRecUSD > 0
    ? `Se ficares em USD (${r.juroUSD.toFixed(2)}% APY): recuperas a fee em <strong>${diasRecUSD} dias</strong>.`
    : '';
  const feeTextoEUR = diasRecEUR > 0
    ? `Se converteres para EUR (${r.juroEUR.toFixed(2)}% APY): recuperas a fee em <strong>${diasRecEUR} dias</strong>.`
    : '';

  // Macro: máx 2 eventos, como pills
  const macroHTML = r.eventosMacro.length ? `
    <div class="macro-pills">
      ${r.eventosMacro.slice(0, 2).map(e => {
        const icone  = e.tipo === 'fed' ? '🇺🇸 Fed' : '🇪🇺 BCE';
        const dataFmt = new Date(e.data + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
        return `<span class="macro-pill${e.dias <= 5 ? ' urgente' : ''}">${icone} ${dataFmt} (em ${e.dias}d)</span>`;
      }).join('')}
    </div>` : '';

  document.getElementById('numeros').innerHTML = `
    <div class="numeros-grid">
      <table class="tabela">
        <tr><td class="label">Taxa BCE</td><td><strong>${r.taxaAtual.toFixed(5)}</strong></td></tr>
        <tr><td class="label">Taxa Wise</td><td><strong>${r.wise.taxa.toFixed(5)}</strong></td></tr>
        <tr><td class="label">Fee Wise</td><td><strong>$${feeUSD.toFixed(2)}</strong></td></tr>
        <tr class="destaque"><td class="label">Recebes hoje</td><td><strong>€${fmtEUR(r.eurHoje)}</strong></td></tr>
      </table>
      <div class="breakeven-bloco">
        <p class="breakeven-texto">${feeTextoUSD}</p>
        <p class="breakeven-texto">${feeTextoEUR}</p>
        <p class="breakeven-sub">Diferencial de juros: USD ${r.juroUSD.toFixed(2)}% APY vs EUR ${r.juroEUR.toFixed(2)}% APY</p>
        ${macroHTML}
      </div>
    </div>
    <p class="aviso-nota">Análise baseada em padrões históricos. Não constitui aconselhamento financeiro — taxas futuras são incertas.</p>
  `;
}

// ═══════════════════════════════════════════════════════════════
// ARQUIVO E ALERTAS (N2, N3)
// ═══════════════════════════════════════════════════════════════
function guardarArquivo(r) {
  try {
    const arquivo = JSON.parse(localStorage.getItem('cambio_arquivo') || '[]');
    arquivo.unshift({
      ts: new Date().toISOString(),
      montante: r.montante,
      taxa: r.taxaAtual,
      wise: r.wise.taxa,
      eur: r.eurHoje,
      decisao: r.recomendacao.decisao,
      score: r.recomendacao.score,
    });
    localStorage.setItem('cambio_arquivo', JSON.stringify(arquivo.slice(0, 30)));
  } catch {}
}

function mostrarArquivo() {
  const arquivo = JSON.parse(localStorage.getItem('cambio_arquivo') || '[]');
  if (!arquivo.length) { alert('Sem análises guardadas ainda.'); return; }
  const linhas = arquivo.map(e => {
    const data = new Date(e.ts).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `${data} | $${e.montante.toLocaleString('pt-PT')} | BCE ${e.taxa} | Wise ${e.wise} | €${fmtEUR(e.eur)} | ${e.decisao} (${e.score})`;
  }).join('\n');
  alert('📋 Últimas análises:\n\n' + linhas);
}

function configurarAlerta() {
  const taxa = parseFloat(prompt('Notificar quando taxa BCE atingir (EUR/USD):', '0.9200'));
  if (!taxa || isNaN(taxa)) return;
  localStorage.setItem('cambio_alerta_taxa', taxa);
  alert(`✅ Alerta definido: notificação quando taxa ≥ ${taxa}`);
  verificarAlerta(taxa);
}

function verificarAlerta(taxaMeta) {
  if (!taxaMeta && !(taxaMeta = parseFloat(localStorage.getItem('cambio_alerta_taxa')))) return;
  if (!dadosLatest) return;
  if (dadosLatest.taxa_atual >= taxaMeta) {
    if (Notification.permission === 'granted') {
      new Notification('💱 Câmbio USD/EUR', {
        body: `Taxa ${dadosLatest.taxa_atual} ≥ meta ${taxaMeta} — considera converter agora!`,
        icon: 'favicon.ico',
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { if (p === 'granted') verificarAlerta(taxaMeta); });
    }
  }
}

// ── Utilitários ───────────────────────────────────────────────
function fmt(n)    { return n.toLocaleString('pt-PT'); }
function fmtEUR(n) { return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtData(d){ return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }); }
function addDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
