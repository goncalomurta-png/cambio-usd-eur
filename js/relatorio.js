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
  // Sparkline 30 dias + cone de volatilidade 7 dias
  const hist  = r.historico;
  const taxas = hist.map(d => d.taxa);
  const slice = hist.slice(-30);
  const var30 = taxas.length >= 30
    ? ((taxas[taxas.length - 1] - taxas[taxas.length - 30]) / taxas[taxas.length - 30] * 100)
    : 0;
  const sparklineSVG = buildSparklineCone(slice.map(d => d.taxa), r.taxaAtual, r.volPct, slice[0]?.data);

  // Sinal técnico resumido (1 linha)
  const rsiLabel  = !r.rsi ? '—' : r.rsi > 70 ? `RSI ${r.rsi.toFixed(0)} sobrecomprado ↓` : r.rsi < 30 ? `RSI ${r.rsi.toFixed(0)} sobrevendido ↑` : `RSI ${r.rsi.toFixed(0)} neutro`;
  const macdLabel = !r.macd ? '' : r.macd.sinalCruz === 'alta' ? ' · MACD cruzamento ↑' : r.macd.sinalCruz === 'baixa' ? ' · MACD cruzamento ↓' : ` · MACD ${r.macd.histograma > 0 ? 'positivo' : 'negativo'}`;
  const bollPos   = r.bollinger ? (r.bollinger.taxa - r.bollinger.inferior) / (r.bollinger.superior - r.bollinger.inferior) : 0.5;
  const bollLabel = bollPos > 0.80 ? ' · Bollinger banda sup.' : bollPos < 0.20 ? ' · Bollinger banda inf.' : ' · Bollinger central';
  const techSinal = rsiLabel + macdLabel + bollLabel;

  // Janelas futuras (a partir de hoje, multi-mês)
  const JANELAS_DEF = [
    {nome:'1-5', inicio:1, fim:5}, {nome:'6-10', inicio:6, fim:10},
    {nome:'11-15', inicio:11, fim:15}, {nome:'16-20', inicio:16, fim:20},
    {nome:'21-25', inicio:21, fim:25}, {nome:'26-31', inicio:26, fim:31},
  ];
  const MESES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const proximasJanelas = [];
  for (let m = 0; m <= 3 && proximasJanelas.length < 8; m++) {
    const dataMes = new Date(r.hoje.getFullYear(), r.hoje.getMonth() + m, 1);
    const mesNome = MESES_NOMES[dataMes.getMonth()];
    const probMes = r.porJanela[mesNome] || {};
    for (const j of JANELAS_DEF) {
      if (proximasJanelas.length >= 8) break;
      const dataFim = new Date(dataMes.getFullYear(), dataMes.getMonth(), j.fim + 1);
      if (dataFim <= r.hoje) continue; // janela já terminou
      const dataInicio = new Date(dataMes.getFullYear(), dataMes.getMonth(), j.inicio);
      const isAtual  = dataInicio <= r.hoje;
      const isOtima  = r.proximaOtima?.janela === j.nome && r.proximaOtima?.mes === mesNome;
      const prob     = probMes[j.nome] || 0;
      proximasJanelas.push({ janela: j.nome, mes: mesNome, prob, isAtual, isOtima, dataInicio });
    }
  }
  const maxProb = Math.max(...proximasJanelas.map(j => j.prob), 1);
  const fluxoBars = proximasJanelas.map(({ janela, mes, prob, isAtual, isOtima, dataInicio }) => {
    const barH = Math.round((prob / maxProb) * 40 + 4);
    const cls  = isAtual ? 'fb-atual' : isOtima ? 'fb-otima' : prob >= 30 ? 'fb-bom' : 'fb-fraco';
    const labelMes = dataInicio.getMonth() !== r.hoje.getMonth()
      ? `<div class="flux-mes">${mes}</div>` : '';
    return `
      <div class="flux-col" title="${mes} dias ${janela}: ${prob.toFixed(1)}%${isAtual ? ' (agora)' : ''}${isOtima ? ' ★ melhor' : ''}">
        ${labelMes}
        <div class="flux-bar ${cls}" style="height:${barH}px"></div>
        <div class="flux-dia">${janela.split('-')[0]}</div>
      </div>`;
  }).join('');

  const fluxoTexto = r.proximaOtima
    ? `Agora: ${r.janela} ${r.mesNome} · ${r.probAtual.toFixed(1)}% &nbsp;→&nbsp; Melhor: ${r.proximaOtima.janela} ${r.proximaOtima.mes} em ${r.proximaOtima.dias}d · ${r.proximaOtima.prob.toFixed(1)}%`
    : `Agora: ${r.janela} ${r.mesNome} · ${r.probAtual.toFixed(1)}% — sem janela significativamente melhor nos próximos ${r.flexibilidade} dias`;

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
        ${sparklineSVG}
        <div class="sparkline-footer">
          <span>${slice[0]?.data || ''}</span>
          <span>Hoje · +7d ±σ</span>
        </div>
        <p class="tech-sinal">${techSinal}</p>
      </div>

      <div class="ctx-dir">
        <div class="flux-titulo">Próximas janelas de conversão</div>
        <div class="flux-legend">
          <span class="fl-item"><span class="fl-dot fb-atual"></span>Agora</span>
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

// ── Sparkline com cone de volatilidade ────────────────────────
function buildSparklineCone(taxas, taxaAtual, volPct, dataInicio) {
  const W = 300, H = 66, PAD = 4;
  const n = taxas.length;

  // 1σ diária absoluta → projecto √7 dias (random walk)
  const vol1d  = taxaAtual * (volPct / 100);
  const sig1_7 = vol1d * Math.sqrt(7);
  const sig2_7 = vol1d * 2 * Math.sqrt(7);

  // Escala Y: inclui o cone para não cortar
  const allV = [...taxas, taxaAtual + sig2_7, taxaAtual - sig2_7];
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const rng  = maxV - minV || 0.001;
  const toY  = v => +(PAD + (H - 2 * PAD) * (1 - (v - minV) / rng)).toFixed(1);

  // X: histórico ocupa 74% da largura, cone os restantes 26%
  const histW = Math.round(W * 0.74);
  const endX  = W - PAD;
  const toXh  = i => +(PAD + (histW - 2 * PAD) * (i / Math.max(n - 1, 1))).toFixed(1);

  const todayX = histW;
  const todayY = toY(taxaAtual);

  const pts  = taxas.map((v, i) => `${toXh(i)},${toY(v)}`).join(' ');
  const y1hi = toY(taxaAtual + sig1_7);
  const y1lo = toY(taxaAtual - sig1_7);
  const y2hi = toY(taxaAtual + sig2_7);
  const y2lo = toY(taxaAtual - sig2_7);

  // Posições dos labels ±σ (evitar sobreposição)
  const lbl2Y = Math.max(y2hi - 2, 9);
  const lbl1Y = Math.max(y1hi - 2, lbl2Y + 10);

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;height:${H}px;display:block;border-radius:8px;background:#f8f9fb">
    <!-- divisor hoje -->
    <line x1="${todayX}" y1="2" x2="${todayX}" y2="${H-2}"
      stroke="#d0d4e8" stroke-width="1" stroke-dasharray="3,2"/>
    <!-- cone 2σ -->
    <polygon points="${todayX},${todayY} ${endX},${y2hi} ${endX},${y2lo}"
      fill="#dde5ff" opacity="0.6"/>
    <!-- cone 1σ -->
    <polygon points="${todayX},${todayY} ${endX},${y1hi} ${endX},${y1lo}"
      fill="#a8bcf5" opacity="0.55"/>
    <!-- linha histórica -->
    <polyline points="${pts}" fill="none" stroke="#8899dd"
      stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <!-- ponto hoje -->
    <circle cx="${todayX}" cy="${todayY}" r="3.5" fill="#4361ee"/>
    <!-- labels σ -->
    <text x="${endX-2}" y="${lbl2Y}" text-anchor="end" font-size="7.5" fill="#8899cc">±2σ</text>
    <text x="${endX-2}" y="${lbl1Y}" text-anchor="end" font-size="7.5" fill="#4361ee">±1σ</text>
  </svg>`;
}

// ── Utilitários ───────────────────────────────────────────────
function fmt(n)    { return n.toLocaleString('pt-PT'); }
function fmtEUR(n) { return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtData(d){ return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }); }
function addDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
