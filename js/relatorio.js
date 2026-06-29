// ── Geração do relatório HTML ──────────────────────────────────

function gerarRelatorio(r) {
  secRecomendacao(r);
  secValores(r);
  secTecnicos(r);
  secTendencia(r);
  secJanelas(r);
  secBreakEven(r);
  secMacro(r);
  secPlano(r);
}

// ── Recomendação ──────────────────────────────────────────────
function secRecomendacao(r) {
  const rec = r.recomendacao;
  document.getElementById('recomendacao').innerHTML = `
    <div class="rec-badge ${rec.classe}">${rec.emoji} ${rec.decisao}</div>
    <ul class="rec-razoes">
      ${rec.razoes.map(x => `<li>${x}</li>`).join('')}
    </ul>
  `;
}

// ── Valores actuais ───────────────────────────────────────────
function secValores(r) {
  const liveTag = r.wise.live
    ? '<span class="tag verde">em tempo real</span>'
    : '<span class="tag cinza">estimado</span>';
  document.getElementById('valores').innerHTML = `
    <h2>💰 Valores actuais</h2>
    <table class="tabela">
      <tr><td class="label">Montante USD</td><td><strong>$${fmt(r.montante)}</strong></td></tr>
      <tr><td class="label">Taxa BCE (mid-market)</td><td><strong>${r.taxaAtual.toFixed(5)} EUR/USD</strong></td></tr>
      <tr><td class="label">Taxa Wise ${liveTag}</td><td><strong>${r.wise.taxa.toFixed(5)} EUR/USD</strong></td></tr>
      <tr><td class="label">Fee Wise</td><td><strong>$${r.wise.fee.toFixed(2)}</strong></td></tr>
      <tr class="destaque"><td class="label">EUR a receber hoje</td><td><strong>€${fmtEUR(r.eurHoje)}</strong></td></tr>
    </table>
  `;
}

// ── Indicadores técnicos ──────────────────────────────────────
function secTecnicos(r) {
  const { rsi, macd, bollinger, tendencia } = r;

  const sinais = [];

  // RSI
  if (rsi !== null) {
    const cls   = rsi > 68 ? 'vender' : rsi < 32 ? 'comprar' : 'neutro';
    const label = rsi > 68 ? 'Sobrecomprado' : rsi < 32 ? 'Sobrevendido' : 'Neutro';
    sinais.push(`
      <div class="sinal-card ${cls}">
        <div class="s-nome">RSI (14)</div>
        <div class="s-sinal">${label}</div>
        <div class="s-val">${rsi.toFixed(1)}</div>
      </div>`);
  }

  // MACD
  if (macd) {
    const cruz  = macd.sinalCruz === 'alta' ? 'comprar' : macd.sinalCruz === 'baixa' ? 'vender' : 'neutro';
    const label = macd.sinalCruz === 'alta' ? 'Cruzamento ↑' : macd.sinalCruz === 'baixa' ? 'Cruzamento ↓' : (macd.histograma > 0 ? 'Positivo' : 'Negativo');
    sinais.push(`
      <div class="sinal-card ${macd.histograma > 0 ? 'comprar' : 'vender'}">
        <div class="s-nome">MACD (12,26,9)</div>
        <div class="s-sinal">${label}</div>
        <div class="s-val">Hist: ${macd.histograma > 0 ? '+' : ''}${macd.histograma.toFixed(5)}</div>
      </div>`);
  }

  // Bollinger
  if (bollinger) {
    const pos   = (bollinger.taxa - bollinger.inferior) / (bollinger.superior - bollinger.inferior);
    const cls   = pos > 0.85 ? 'vender' : pos < 0.15 ? 'comprar' : 'neutro';
    const label = pos > 0.85 ? 'Próx. banda sup.' : pos < 0.15 ? 'Próx. banda inf.' : 'Dentro das bandas';
    sinais.push(`
      <div class="sinal-card ${cls}">
        <div class="s-nome">Bollinger (20,2)</div>
        <div class="s-sinal">${label}</div>
        <div class="s-val">${(pos * 100).toFixed(0)}% da banda</div>
      </div>`);
  }

  // Tendência MA
  const clsTend = tendencia === 'alta' ? 'comprar' : tendencia === 'baixa' ? 'vender' : 'neutro';
  sinais.push(`
    <div class="sinal-card ${clsTend}">
      <div class="s-nome">Tendência MA20</div>
      <div class="s-sinal">${tendencia.toUpperCase()}</div>
      <div class="s-val">MA7: ${r.ma7.toFixed(5)} · MA20: ${r.ma20.toFixed(5)}</div>
    </div>`);

  document.getElementById('tecnicos').innerHTML = `
    <h2>📊 Indicadores técnicos</h2>
    <div class="sinais-grid">${sinais.join('')}</div>
    <p style="font-size:.78rem;color:#aaa">RSI e MACD calculados sobre os últimos ${r.historico.length} dias de dados BCE</p>
  `;
}

// ── Tendência / sparkline ─────────────────────────────────────
function secTendencia(r) {
  const hist   = r.historico;
  const taxas  = hist.map(d => d.taxa);
  const min    = Math.min(...taxas);
  const max    = Math.max(...taxas);
  const range  = max - min || 0.001;
  const slice  = hist.slice(-30);

  const bars = slice.map((d, i) => {
    const h       = Math.round(((d.taxa - min) / range) * 58 + 8);
    const isHoje  = i === slice.length - 1;
    return `<div class="s-bar${isHoje ? ' hoje' : ''}" style="height:${h}px" title="${d.data}: ${d.taxa}"></div>`;
  }).join('');

  const variacao30 = taxas.length >= 2
    ? ((taxas[taxas.length - 1] - taxas[taxas.length - 30]) / taxas[taxas.length - 30] * 100)
    : 0;

  document.getElementById('tendencia').innerHTML = `
    <h2>📈 Tendência — últimos 30 dias</h2>
    <div class="metricas">
      <div class="metrica"><div class="m-label">Taxa hoje</div><div class="m-val">${r.taxaAtual.toFixed(5)}</div></div>
      <div class="metrica"><div class="m-label">MA 7 dias</div><div class="m-val">${r.ma7.toFixed(5)}</div></div>
      <div class="metrica"><div class="m-label">MA 20 dias</div><div class="m-val">${r.ma20.toFixed(5)}</div></div>
      <div class="metrica"><div class="m-label">Var. 30 dias</div><div class="m-val ${variacao30 >= 0 ? 'alta' : 'baixa'}">${variacao30 >= 0 ? '+' : ''}${variacao30.toFixed(2)}%</div></div>
      <div class="metrica"><div class="m-label">Volatilidade</div><div class="m-val">${r.volPct.toFixed(2)}%</div><div class="m-sub">desvio padrão 20d</div></div>
    </div>
    <div class="sparkline-wrap">
      <div class="sparkline">${bars}</div>
      <div class="sparkline-footer">
        <span>${slice[0]?.data || ''}</span>
        <span>Hoje (${slice[slice.length-1]?.taxa || ''})</span>
      </div>
    </div>
  `;
}

// ── Janelas históricas ────────────────────────────────────────
function secJanelas(r) {
  const janelas = ['1-5', '6-10', '11-15', '16-20', '21-25', '26-31'];
  const cards   = janelas.map(j => {
    const prob   = r.probJanelas[j] || 0;
    const isAtual = j === r.janela;
    const cls    = prob >= 35 ? 'optimo' : prob >= 30 ? 'mbom' : prob >= 25 ? 'bom' : prob >= 20 ? 'mod' : 'evitar';
    const label  = prob >= 35 ? 'Óptimo' : prob >= 30 ? 'M.Bom' : prob >= 25 ? 'Bom' : prob >= 20 ? 'Moderado' : 'Evitar';
    return `
      <div class="janela-card ${cls}${isAtual ? ' atual' : ''}">
        ${isAtual ? '<div class="j-badge">← HOJE</div>' : ''}
        <div class="j-dias">Dias ${j}</div>
        <div class="j-prob">${prob.toFixed(1)}%</div>
        <div class="j-label">${label}</div>
      </div>`;
  }).join('');

  document.getElementById('janelas').innerHTML = `
    <h2>📅 Janelas históricas — ${r.mesNome}</h2>
    <p class="subtitle" style="font-size:.8rem;color:#aaa;margin-bottom:.9rem">Probabilidade de taxa no top 25% · dados BCE 2010-2024</p>
    <div class="janelas-grid">${cards}</div>
  `;
}

// ── Break-even ────────────────────────────────────────────────
function secBreakEven(r) {
  const eurSeTaxa = (t) => (r.montante - r.wise.fee) * t;
  const eurMeta   = eurSeTaxa(r.taxaBreakEven);

  document.getElementById('break-even').innerHTML = `
    <h2>⚖️ Break-even</h2>
    <table class="tabela">
      <tr><td class="label">Flexibilidade de espera</td><td><strong>${r.flexibilidade} dias</strong></td></tr>
      <tr><td class="label">Juro USD (${r.juroUSD.toFixed(2)}% APY)</td><td>+$${r.ganhoJuro.toFixed(2)} de juros por esperar ${r.flexibilidade}d</td></tr>
      <tr><td class="label">Taxa Wise necessária</td><td><strong>${r.taxaBreakEven.toFixed(5)} EUR/USD</strong></td></tr>
      <tr><td class="label">Melhoria necessária</td><td><strong>+${r.deltaPct.toFixed(3)}%</strong> (+${r.deltaNeeded.toFixed(5)} EUR/USD)</td></tr>
      <tr class="destaque"><td class="label">EUR a receber no break-even</td><td><strong>€${fmtEUR(eurMeta)}</strong></td></tr>
    </table>
    ${r.proximaOtima ? `
    <div class="proxima-otima">
      ⭐ Próxima janela óptima: <strong>dias ${r.proximaOtima.janela}</strong>
      (${r.proximaOtima.prob.toFixed(1)}%) — em <strong>${r.proximaOtima.dias} dias</strong>
      · ${r.proximaOtima.data?.toLocaleDateString('pt-PT') || ''}
    </div>` : ''}
  `;
}

// ── Calendário macro ──────────────────────────────────────────
function secMacro(r) {
  if (!r.eventosMacro.length) {
    document.getElementById('macro').innerHTML = `
      <h2>📆 Calendário macro</h2>
      <p style="color:#aaa;font-size:.88rem">Sem reuniões Fed/BCE nos próximos ${r.flexibilidade + 10} dias.</p>`;
    return;
  }
  const items = r.eventosMacro.map(e => {
    const urgente = e.dias <= 5 ? ' evento-urgente' : '';
    const dataFmt = new Date(e.data + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
    const icone   = e.tipo === 'fed' ? '🇺🇸' : '🇪🇺';
    return `
      <li class="evento-item${urgente}">
        <span class="evento-data">${dataFmt}</span>
        <span class="evento-nome">${icone} ${e.nome}</span>
        <span class="evento-dias">em ${e.dias}d</span>
      </li>`;
  }).join('');

  document.getElementById('macro').innerHTML = `
    <h2>📆 Calendário macro</h2>
    <ul class="eventos-lista">${items}</ul>
    <p style="font-size:.76rem;color:#bbb;margin-top:.75rem">Reuniões Fed e BCE costumam causar movimentos significativos no USD/EUR</p>
  `;
}

// ── Plano de acção ────────────────────────────────────────────
function secPlano(r) {
  const d0  = r.hoje;
  const d5  = addDias(d0, 5);
  const dMax = addDias(d0, r.flexibilidade);

  const stopLoss     = (r.wise.taxa * 0.997).toFixed(5);
  const metaConvert  = (r.wise.taxa * 1.003).toFixed(5);
  const eurParcial50 = fmtEUR((r.montante / 2 - r.wise.fee / 2) * r.wise.taxa);

  const acaoHoje = {
    'CONVERTER AGORA': `✅ Converter $${fmt(r.montante)} na Wise agora · recebes €${fmtEUR(r.eurHoje)}`,
    'AGUARDAR': `⏳ Não converter — monitorizar taxa diariamente`,
    'CONVERSÃO PARCIAL': `⚖️ Converter 50% ($${fmt(r.montante / 2)}) hoje → €${eurParcial50} · manter o resto`,
  }[r.recomendacao.decisao];

  const itens = [
    { data: 'Hoje',                         acao: acaoHoje },
    { data: `+5 dias (${fmtData(d5)})`,     acao: `Converter se taxa Wise ≥ ${metaConvert} EUR/USD` },
    { data: `+${r.flexibilidade}d (${fmtData(dMax)})`, acao: `Stop-loss: converter tudo se taxa Wise < ${stopLoss} EUR/USD` },
  ];

  document.getElementById('plano').innerHTML = `
    <h2>📋 Plano de acção</h2>
    <ul class="plano-lista">
      ${itens.map(i => `
        <li class="plano-item">
          <span class="plano-data">${i.data}</span>
          <span>${i.acao}</span>
        </li>`).join('')}
    </ul>
  `;
}

// ── Utilitários de formatação ─────────────────────────────────
function fmt(n)    { return n.toLocaleString('pt-PT'); }
function fmtEUR(n) { return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtData(d){ return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }); }
function addDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
