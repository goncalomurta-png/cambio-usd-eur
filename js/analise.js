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
    const diasAtraso = Math.floor((Date.now() - new Date(latest.updated + 'T00:00:00Z')) / 86400000);
    if (diasAtraso > 1) {
      el.className  = 'status-dados aviso';
      el.textContent = `⚠️ Dados com ${diasAtraso} dias de atraso (${latest.updated}) — GitHub Action pode não ter corrido`;
    } else {
      el.className  = 'status-dados ok';
      el.textContent = `✓ Dados de ${latest.updated} · BCE: 1 USD = ${latest.taxa_atual} EUR · Wise: ${latest.wise_taxa} EUR`;
    }
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

  // Wise realtime via CORS é sempre bloqueada no browser — usa estimativa dos dados guardados
  const wise = estimarWise(montante);

  try {
    const resultado = calcularAnalise(montante, flexibilidade, wise, dadosLatest, dadosHistorico);
    gerarRelatorio(resultado);
    document.getElementById('relatorio').style.display = 'block';
    document.getElementById('decisao').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    alert('Erro na análise: ' + e.message);
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
  // UTC para consistência com dados BCE (sem desfasamento de timezone)
  const hoje  = new Date();
  const mes   = hoje.getUTCMonth();  // 0-11
  const dia   = hoje.getUTCDate();   // 1-31
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const mesNome = meses[mes];

  if (!latest.historico || latest.historico.length < 30) throw new Error('Histórico insuficiente (mínimo 30 dias)');
  const taxas    = latest.historico.map(d => d.taxa);
  const datas    = latest.historico.map(d => d.data);
  const taxaAtual = latest.taxa_atual;
  if (!taxaAtual) throw new Error('Taxa actual em falta no JSON de dados');

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

  // Distribuição de probabilidade da espera (N1)
  const distEspera = calcularDistribuicaoEspera(taxas, taxaAtual, flexibilidade);

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
    eventosMacro, distEspera,
    juroUSD: juroUSD * 100, juroEUR: juroEUR * 100,
    historico: latest.historico,
    datas,
    recomendacao: rec,
  };
}

// ── Distribuição de probabilidade da espera (N1) ──────────────
// Com base na volatilidade histórica recente, qual a prob de a taxa subir X% em Y dias?
function calcularDistribuicaoEspera(taxas, taxaAtual, maxDias) {
  if (taxas.length < 30) return null;
  const retornos = [];
  for (let i = 1; i < taxas.length; i++) retornos.push((taxas[i] - taxas[i-1]) / taxas[i-1]);
  const mu  = media(retornos);
  const sig = desvPad(retornos);

  const horizontes = [5, 10, 15, maxDias].filter((v, i, a) => a.indexOf(v) === i && v <= maxDias + 5);
  return horizontes.map(dias => {
    const muTotal  = mu * dias;
    const sigTotal = sig * Math.sqrt(dias);
    // Prob de taxa subir pelo menos 0.5%
    const z05  = (-0.005 - muTotal) / sigTotal;
    const z10  = (-0.010 - muTotal) / sigTotal;
    const prob05 = Math.round((1 - normCDF(z05)) * 100);
    const prob10 = Math.round((1 - normCDF(z10)) * 100);
    return { dias, prob05, prob10, sigTotal: (sigTotal * 100).toFixed(2) };
  });
}

// Aproximação CDF normal (Abramowitz & Stegun 26.2.17)
function normCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
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

  // ── Indicadores técnicos (RSI + MACD + Bollinger) ────────────
  // Contribuição máxima conjunta: ±20 pontos (evita triple-counting)
  let techScore = 0;

  if (rsi !== null) {
    if (rsi > 70) {
      techScore -= 10;
      razoes.push(`RSI ${rsi.toFixed(0)} — sobrecomprado, taxa tende a corrigir → converter`);
    } else if (rsi < 30) {
      techScore += 10;
      razoes.push(`RSI ${rsi.toFixed(0)} — sobrevendido, taxa tende a recuperar → aguardar`);
    } else {
      razoes.push(`RSI ${rsi.toFixed(0)} — zona neutra`);
    }
  }

  if (macd) {
    if (macd.sinalCruz === 'alta') {
      techScore += 8;
      razoes.push('MACD cruzou para cima — momentum positivo → aguardar');
    } else if (macd.sinalCruz === 'baixa') {
      techScore -= 8;
      razoes.push('MACD cruzou para baixo — momentum negativo → converter');
    } else {
      razoes.push(`MACD histograma: ${macd.histograma >= 0 ? '+' : ''}${macd.histograma.toFixed(5)}`);
    }
  }

  if (bollinger) {
    const pos = (bollinger.taxa - bollinger.inferior) / (bollinger.superior - bollinger.inferior);
    if (pos > 0.80) {
      techScore -= 6;
      razoes.push(`Taxa perto da Banda Superior Bollinger (${(pos*100).toFixed(0)}%) — resistência → converter`);
    } else if (pos < 0.20) {
      techScore += 6;
      razoes.push(`Taxa perto da Banda Inferior Bollinger (${(pos*100).toFixed(0)}%) — suporte → aguardar`);
    }
  }

  score += Math.max(-20, Math.min(20, techScore));

  // ── Break-even fácil ──────────────────────────────────────────
  if (deltaPct < 0.05) {
    score += 8;
    razoes.push(`Break-even trivial: taxa só precisa de subir ${deltaPct.toFixed(3)}% para compensar`);
  }

  // ── Decisão (zona PARCIAL alargada: 35-65) ────────────────────
  score = Math.max(0, Math.min(100, score));
  let decisao, classe, emoji;
  if (score >= 65) {
    decisao = 'AGUARDAR'; classe = 'aguardar'; emoji = '⏳';
  } else if (score <= 35) {
    decisao = 'CONVERTER AGORA'; classe = 'converter'; emoji = '✅';
  } else {
    decisao = 'CONVERSÃO PARCIAL'; classe = 'parcial'; emoji = '⚖️';
  }

  return { decisao, classe, emoji, score, razoes };
}

// ── Indicadores técnicos ───────────────────────────────────────
function calcularRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  // Warm-up sobre toda a série para Wilder smoothing estável
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcularMACD(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow + signal) return null;

  // Séries EMA completas (uma passagem por cada)
  const emaFastSeries = calcularEMASeries(prices, fast);
  const emaSlowSeries = calcularEMASeries(prices, slow);
  if (!emaFastSeries.length || !emaSlowSeries.length) return null;

  // Alinhar pelo fim: slow começa depois de fast → offset = slow - fast
  const offset = emaFastSeries.length - emaSlowSeries.length;
  const macdSeries = emaSlowSeries.map((es, i) => emaFastSeries[i + offset] - es);

  if (macdSeries.length < signal) return null;

  const signalSeries = calcularEMASeries(macdSeries, signal);
  const macdLast   = macdSeries[macdSeries.length - 1];
  const signalLast = signalSeries[signalSeries.length - 1];
  const hist       = macdLast - signalLast;

  const macdPrev   = macdSeries[macdSeries.length - 2] ?? macdLast;
  const signalPrev = signalSeries[signalSeries.length - 2] ?? signalLast;
  const prevHist   = macdPrev - signalPrev;

  return {
    macd: macdLast,
    sinal: signalLast,
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

// EMA escalar (valor final apenas)
function calcularEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = media(prices.slice(0, period));
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

// EMA como série completa (necessário para MACD correcto)
function calcularEMASeries(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let ema = media(prices.slice(0, period));
  result.push(ema);
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ── Calendário macro ───────────────────────────────────────────
function getEventosMacro(calendario, hoje, diasHorizonte) {
  if (!calendario) return [];
  const eventos = [];
  const limite  = new Date(hoje); limite.setDate(limite.getDate() + diasHorizonte);
  const anoAtual = hoje.getUTCFullYear();

  const adicionar = (datas, nome, tipo) => {
    (datas || []).forEach(d => {
      const data = new Date(d + 'T12:00:00Z');
      if (data >= hoje && data <= limite) {
        const dias = Math.round((data - hoje) / 86400000);
        eventos.push({ data: d, nome, tipo, dias });
      }
    });
  };

  // Suporta qualquer ano presente no calendário (fed_YYYY / bce_YYYY)
  [anoAtual, anoAtual + 1].forEach(ano => {
    adicionar(calendario[`fed_${ano}`], 'Reunião Fed (FOMC)', 'fed');
    adicionar(calendario[`bce_${ano}`], 'Reunião BCE', 'bce');
  });

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
    if (prob - probAtual < 3) continue; // diferença mínima de 3pp para valer a pena esperar

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

// EUR recebidos após taxa e fee (partilhado entre analise e relatorio)
function eurAtaxa(taxa, fee, montante) {
  return (montante - Math.max(fee, 0)) * taxa;
}
