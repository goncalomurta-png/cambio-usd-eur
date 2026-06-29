// ── Estado global ──────────────────────────────────────────────
let dadosLatest = null;
let dadosHistorico = null;

// ── Carregamento inicial ────────────────────────────────────────
async function carregarDados() {
  const el = document.getElementById('status-dados');
  try {
    el.textContent = 'A carregar dados…';
    const [latest, historico] = await Promise.all([
      fetch('data/latest.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch('data/historico.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ]);
    dadosLatest   = latest;
    dadosHistorico = historico;
    el.className  = 'status-dados ok';
    el.textContent = `✓ Dados de ${latest.updated} · BCE: 1 USD = ${latest.taxa_atual} EUR · Wise: ${latest.wise_taxa} EUR`;
    document.getElementById('ultima-actualizacao').textContent = latest.updated;
  } catch {
    el.className  = 'status-dados err';
    el.textContent = '⚠️ Erro ao carregar dados. Confirma que o GitHub Action correu pelo menos uma vez.';
  }
}

// ── Ponto de entrada ───────────────────────────────────────────
async function analisar() {
  if (!dadosLatest || !dadosHistorico) {
    alert('Dados ainda não carregados. Aguarda um momento.');
    return;
  }
  const montante      = parseFloat(document.getElementById('montante').value) || 6600;
  const flexibilidade = parseInt(document.getElementById('flexibilidade').value)   || 15;

  // Tenta buscar taxa Wise em tempo real para o montante exacto
  const wise = await fetchWiseRealtime(montante) || estimarWise(montante);

  const resultado = calcularAnalise(montante, flexibilidade, wise, dadosLatest, dadosHistorico);
  gerarRelatorio(resultado);

  document.getElementById('relatorio').style.display = 'block';
  document.getElementById('recomendacao').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Wise em tempo real (CORS best-effort) ──────────────────────
async function fetchWiseRealtime(amount) {
  try {
    const url = `https://api.wise.com/v3/comparisons/?sourceCurrency=USD&targetCurrency=EUR&sendAmount=${amount}&sourceCountry=GB&targetCountry=DE`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const data = await r.json();
    const wise = data.providers?.find(p => p.alias === 'wise');
    if (!wise) return null;
    const quote = wise.quotes?.find(q => q.markup === 0.0) || wise.quotes?.[0];
    if (!quote) return null;
    return { taxa: quote.rate, fee: quote.fee, eur: quote.receivedAmount, live: true };
  } catch {
    return null;
  }
}

// ── Estimativa Wise a partir dos dados guardados ───────────────
function estimarWise(montante) {
  const d = dadosLatest;
  const fee = d.wise_fee_fixo + (d.wise_fee_variavel_pct / 100) * montante;
  return {
    taxa: d.wise_taxa,
    fee:  Math.max(fee, 0),
    eur:  (montante - Math.max(fee, 0)) * d.wise_taxa,
    live: false,
  };
}

// ── Análise principal ──────────────────────────────────────────
function calcularAnalise(montante, flexibilidade, wise, latest, historico) {
  const hoje  = new Date();
  const mes   = hoje.getMonth();     // 0-11
  const dia   = hoje.getDate();      // 1-31
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const mesNome = meses[mes];

  const taxas    = latest.historico.map(d => d.taxa);
  const datas    = latest.historico.map(d => d.data);
  const taxaAtual = latest.taxa_atual;

  // Médias móveis
  const ma7  = media(taxas.slice(-7));
  const ma20 = media(taxas.slice(-20));
  const ma50 = taxas.length >= 50 ? media(taxas.slice(-50)) : null;

  // Tendência
  const diffMA = (taxaAtual - ma20) / ma20 * 100;
  const tendencia = diffMA > 0.2 ? 'alta' : diffMA < -0.2 ? 'baixa' : 'lateral';
  const forcaTendencia = Math.abs(diffMA);

  // Volatilidade (desvio padrão 20 dias)
  const vol20 = desvPad(taxas.slice(-20));
  const volPct = (vol20 / taxaAtual) * 100;

  // Indicadores técnicos
  const rsi     = calcularRSI(taxas, 14);
  const macd    = calcularMACD(taxas, 12, 26, 9);
  const bollinger = calcularBollinger(taxas, 20, 2);

  // Janela temporal
  const janela     = getJanela(dia);
  const probJanelas = historico.por_janela[mesNome] || {};
  const probAtual  = probJanelas[janela] || 0;
  const melhorEntry = Object.entries(probJanelas).sort((a, b) => b[1] - a[1])[0];

  // Próxima janela óptima dentro da flexibilidade
  const proximaOtima = encontrarProximaOtima(dia, hoje, probJanelas, probAtual, flexibilidade);

  // Cálculo Wise para o montante
  const eurHoje = wise.eur;
  const feeHoje = wise.fee;

  // Diferencial de juros (USD vs EUR, diário)
  const juroUSD    = (latest.juro_usd || 3.39) / 100;
  const juroEUR    = (latest.juro_eur || 1.98) / 100;
  const diffDiario = (juroUSD - juroEUR) / 365;
  const ganhoJuro  = montante * diffDiario * flexibilidade;

  // Break-even: melhoria de taxa necessária para superar ganho de juro ao esperar
  const deltaNeeded    = wise.taxa * diffDiario * flexibilidade;
  const taxaBreakEven  = wise.taxa + deltaNeeded;
  const deltaPct       = (deltaNeeded / wise.taxa) * 100;

  // Calendário macro
  const eventosMacro = getEventosMacro(historico.calendario_macro, hoje, flexibilidade + 10);

  // Recomendação
  const rec = calcularRecomendacao({
    tendencia, forcaTendencia, probAtual, probJanelas, melhorEntry,
    proximaOtima, flexibilidade, deltaPct, rsi, macd, bollinger, volPct,
  });

  return {
    hoje, mesNome, dia, montante, flexibilidade,
    taxaAtual, wise, eurHoje, feeHoje,
    ma7, ma20, ma50, tendencia, forcaTendencia, volPct,
    rsi, macd, bollinger,
    janela, probAtual, probJanelas, melhorEntry, proximaOtima,
    ganhoJuro, taxaBreakEven, deltaNeeded, deltaPct,
    eventosMacro,
    juroUSD: juroUSD * 100, juroEUR: juroEUR * 100,
    historico: latest.historico,
    datas,
    recomendacao: rec,
  };
}

// ── Recomendação por score ─────────────────────────────────────
// Score 0-100: >60 = AGUARDAR, <40 = CONVERTER AGORA, 40-60 = PARCIAL
// Factores que AUMENTAM score = razões para ESPERAR
// Factores que DIMINUEM score = razões para CONVERTER JÁ
function calcularRecomendacao({ tendencia, forcaTendencia, probAtual, probJanelas, melhorEntry,
  proximaOtima, flexibilidade, deltaPct, rsi, macd, bollinger }) {

  let score = 50;
  const razoes = [];
  const probMax = melhorEntry?.[1] || probAtual || 1;

  // ── Janela histórica ───────────────────────────────────────────
  if (proximaOtima && proximaOtima.dias <= flexibilidade) {
    // Há janela melhor acessível → razão para esperar → SOBE score
    const ganho    = proximaOtima.prob - probAtual;
    const urgencia = proximaOtima.dias <= 3 ? 1.6 : proximaOtima.dias <= 7 ? 1.2 : 1.0;
    const bonus    = Math.min(Math.round(ganho * urgencia), 40);
    score += bonus;
    razoes.push(`Janela ${proximaOtima.janela} em ${proximaOtima.dias} dias tem ${proximaOtima.prob.toFixed(1)}% vs ${probAtual.toFixed(1)}% agora — vale esperar`);
  } else if (probAtual / probMax >= 0.85) {
    // Janela actual é a melhor → converter agora → DESCE score
    score -= 20;
    razoes.push(`Janela actual óptima (${probAtual.toFixed(1)}%) — melhor momento histórico para converter`);
  } else {
    // Janela fraca e sem alternativa melhor → ligeiro incentivo a converter
    score -= Math.round((1 - probAtual / probMax) * 10);
    razoes.push(`Janela actual fraca (${probAtual.toFixed(1)}%) sem alternativa melhor nos próximos ${flexibilidade} dias`);
  }

  // ── Tendência de preço ─────────────────────────────────────────
  if (tendencia === 'alta' && forcaTendencia > 0.15) {
    score += 12;
    razoes.push(`Taxa em tendência de alta (+${forcaTendencia.toFixed(2)}% vs MA20) — aguardar pode render mais`);
  } else if (tendencia === 'baixa' && forcaTendencia > 0.15) {
    score -= 12;
    razoes.push(`Taxa em tendência de baixa (−${forcaTendencia.toFixed(2)}% vs MA20) — converter antes que desça mais`);
  } else {
    razoes.push(`Taxa lateral (${forcaTendencia.toFixed(2)}% vs MA20)`);
  }

  // ── RSI ───────────────────────────────────────────────────────
  if (rsi !== null) {
    if (rsi > 68) {
      score -= 15;
      razoes.push(`RSI ${rsi.toFixed(0)} — sobrecomprado, taxa tende a corrigir → converter`);
    } else if (rsi < 32) {
      score += 15;
      razoes.push(`RSI ${rsi.toFixed(0)} — sobrevendido, taxa tende a recuperar → aguardar`);
    } else {
      razoes.push(`RSI ${rsi.toFixed(0)} — zona neutra`);
    }
  }

  // ── MACD ──────────────────────────────────────────────────────
  if (macd) {
    if (macd.sinalCruz === 'alta') {
      score += 10;
      razoes.push('MACD cruzou para cima — momentum positivo → aguardar');
    } else if (macd.sinalCruz === 'baixa') {
      score -= 10;
      razoes.push('MACD cruzou para baixo — momentum negativo → converter');
    } else {
      razoes.push(`MACD histograma: ${macd.histograma >= 0 ? '+' : ''}${macd.histograma.toFixed(5)}`);
    }
  }

  // ── Bollinger ─────────────────────────────────────────────────
  if (bollinger) {
    const pos = (bollinger.taxa - bollinger.inferior) / (bollinger.superior - bollinger.inferior);
    if (pos > 0.85) {
      score -= 10;
      razoes.push(`Taxa perto da Banda Superior Bollinger (${(pos*100).toFixed(0)}%) — resistência → converter`);
    } else if (pos < 0.15) {
      score += 10;
      razoes.push(`Taxa perto da Banda Inferior Bollinger (${(pos*100).toFixed(0)}%) — suporte → aguardar`);
    }
  }

  // ── Break-even fácil ──────────────────────────────────────────
  if (deltaPct < 0.05) {
    score += 8;
    razoes.push(`Break-even trivial: taxa só precisa de subir ${deltaPct.toFixed(3)}% para compensar`);
  }

  // ── Decisão ───────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));
  let decisao, classe, emoji;
  if (score >= 60) {
    decisao = 'AGUARDAR'; classe = 'aguardar'; emoji = '⏳';
  } else if (score <= 40) {
    decisao = 'CONVERTER AGORA'; classe = 'converter'; emoji = '✅';
  } else {
    decisao = 'CONVERSÃO PARCIAL'; classe = 'parcial'; emoji = '⚖️';
  }

  return { decisao, classe, emoji, score, razoes };
}

// ── Indicadores técnicos ───────────────────────────────────────
function calcularRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  const slice = prices.slice(-(period + 10));
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = slice[i] - slice[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcularMACD(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow + signal) return null;
  const emaFast = calcularEMA(prices, fast);
  const emaSlow = calcularEMA(prices, slow);
  if (!emaFast || !emaSlow) return null;
  const macdLine = emaFast - emaSlow;

  // Linha de sinal (EMA do MACD das últimas N sessões)
  const macdSeries = prices.slice(-(slow + signal)).map((_, i, arr) => {
    const ef = calcularEMA(prices.slice(0, prices.length - arr.length + i + 1), fast);
    const es = calcularEMA(prices.slice(0, prices.length - arr.length + i + 1), slow);
    return (ef && es) ? ef - es : 0;
  });
  const signalLine = calcularEMA(macdSeries, signal);
  const hist       = signalLine ? macdLine - signalLine : 0;
  const prevHist   = macdSeries.length >= 2 ? macdSeries[macdSeries.length - 2] - signalLine : hist;

  return {
    macd: macdLine,
    sinal: signalLine || 0,
    histograma: hist,
    sinalCruz: hist > 0 && prevHist <= 0 ? 'alta' : hist < 0 && prevHist >= 0 ? 'baixa' : 'sem',
  };
}

function calcularBollinger(prices, period = 20, mult = 2) {
  if (prices.length < period) return null;
  const slice  = prices.slice(-period);
  const media_ = media(slice);
  const dp     = desvPad(slice);
  return {
    media: media_,
    superior: media_ + mult * dp,
    inferior: media_ - mult * dp,
    taxa: prices[prices.length - 1],
  };
}

function calcularEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = media(prices.slice(0, period));
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

// ── Calendário macro ───────────────────────────────────────────
function getEventosMacro(calendario, hoje, diasHorizonte) {
  if (!calendario) return [];
  const eventos = [];
  const limite  = new Date(hoje); limite.setDate(limite.getDate() + diasHorizonte);

  const adicionar = (datas, nome, tipo) => {
    (datas || []).forEach(d => {
      const data = new Date(d + 'T12:00:00');
      if (data >= hoje && data <= limite) {
        const dias = Math.round((data - hoje) / 86400000);
        eventos.push({ data: d, nome, tipo, dias });
      }
    });
  };

  adicionar(calendario.fed_2026, 'Reunião Fed (FOMC)', 'fed');
  adicionar(calendario.bce_2026, 'Reunião BCE', 'bce');

  return eventos.sort((a, b) => a.dias - b.dias);
}

// ── Janela e proxima óptima ────────────────────────────────────
function getJanela(dia) {
  if (dia <=  5) return '1-5';
  if (dia <= 10) return '6-10';
  if (dia <= 15) return '11-15';
  if (dia <= 20) return '16-20';
  if (dia <= 25) return '21-25';
  return '26-31';
}

function encontrarProximaOtima(diaAtual, hoje, probJanelas, probAtual, maxDias) {
  const janelas   = ['1-5', '6-10', '11-15', '16-20', '21-25', '26-31'];
  const inicios   = [1, 6, 11, 16, 21, 26];
  const idxAtual  = janelas.indexOf(getJanela(diaAtual));

  for (let i = 1; i < janelas.length * 2; i++) {
    const idx     = (idxAtual + i) % janelas.length;
    const janela  = janelas[idx];
    const inicio  = inicios[idx];
    const prob    = probJanelas[janela] || 0;
    if (prob <= probAtual) continue;

    let data = new Date(hoje);
    if (inicio > diaAtual) {
      data.setDate(inicio);
    } else {
      data.setMonth(data.getMonth() + 1);
      data.setDate(inicio);
    }
    const dias = Math.round((data - hoje) / 86400000);
    if (dias > maxDias) break;
    return { janela, prob, dias, data };
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────
function media(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function desvPad(arr) {
  const m = media(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
