#!/usr/bin/env python3
"""
Backtest de validação do modelo de score USD→EUR.
Usa apenas stdlib Python. Dados: BCE via Frankfurter.dev
"""

import json
import math
import datetime
import urllib.request
import statistics
import sys
import os
from pathlib import Path

# ── Configuração ───────────────────────────────────────────────────────────────
DATE_FROM    = "2015-01-01"
FLEXIBILIDADE = 15
WARMUP        = 26 + 9 + 20 + 5  # MACD(26) + signal(9) + Bollinger(20) + margem

MESES_NOME = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

# ── Download dados BCE ─────────────────────────────────────────────────────────
def fetch_bce(date_from=DATE_FROM):
    """
    Frankfurter v2 /rates com intervalo de datas devolve lista de objectos:
    [{"date":"2015-01-01","base":"USD","quote":"EUR","rate":0.82244}, ...]
    """
    today = datetime.date.today().isoformat()
    url = f"https://api.frankfurter.dev/v2/rates?from={date_from}&to={today}&base=USD&quotes=EUR"
    print(f"A descarregar dados BCE de {date_from} → {today}...", flush=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = json.loads(r.read())
    except Exception as e:
        print(f"AVISO: Erro a descarregar dados BCE: {e}", flush=True)
        return None

    # Resposta normal: lista de {date, base, quote, rate}
    if isinstance(raw, list):
        return [{"data": d["date"], "taxa": round(d["rate"], 6)} for d in sorted(raw, key=lambda x: x["date"])]

    # Fallback dict com "rates": {"2015-01-01": {"EUR": 0.82}, ...}
    if isinstance(raw, dict) and "rates" in raw:
        series = []
        for date_str, vals in sorted(raw["rates"].items()):
            if isinstance(vals, dict) and "EUR" in vals:
                series.append({"data": date_str, "taxa": round(vals["EUR"], 6)})
            elif isinstance(vals, (int, float)):
                series.append({"data": date_str, "taxa": round(vals, 6)})
        return series if series else None

    print(f"AVISO: Formato de resposta inesperado: {type(raw)}", flush=True)
    return None


def load_historico():
    path = Path(__file__).parent.parent / "data" / "historico.json"
    with open(path) as f:
        return json.load(f)


def load_latest_fallback():
    """Usa latest.json como fallback se download falhar."""
    path = Path(__file__).parent.parent / "data" / "latest.json"
    with open(path) as f:
        data = json.load(f)
    return data.get("historico", [])


# ── Indicadores técnicos ───────────────────────────────────────────────────────
def media(arr):
    return sum(arr) / len(arr)

def desv_pad(arr):
    m = media(arr)
    return math.sqrt(sum((v - m) ** 2 for v in arr) / len(arr))

def calcular_rsi(prices, period=14):
    if len(prices) < period + 1:
        return None
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = prices[i] - prices[i-1]
        if d > 0: gains += d
        else:     losses += abs(d)
    avg_gain = gains / period
    avg_loss = losses / period
    for i in range(period + 1, len(prices)):
        d = prices[i] - prices[i-1]
        avg_gain = (avg_gain * (period - 1) + max(d, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-d, 0)) / period
    if avg_loss == 0:
        return 100.0
    return 100 - 100 / (1 + avg_gain / avg_loss)

def calcular_ema_series(prices, period):
    if len(prices) < period:
        return []
    k = 2 / (period + 1)
    result = []
    ema = media(prices[:period])
    result.append(ema)
    for p in prices[period:]:
        ema = p * k + ema * (1 - k)
        result.append(ema)
    return result

def calcular_macd(prices, fast=12, slow=26, signal=9):
    if len(prices) < slow + signal:
        return None
    ema_fast = calcular_ema_series(prices, fast)
    ema_slow = calcular_ema_series(prices, slow)
    if not ema_fast or not ema_slow:
        return None
    offset = len(ema_fast) - len(ema_slow)
    macd_series = [ema_fast[i + offset] - ema_slow[i] for i in range(len(ema_slow))]
    if len(macd_series) < signal:
        return None
    signal_series = calcular_ema_series(macd_series, signal)
    macd_last   = macd_series[-1]
    signal_last = signal_series[-1]
    hist        = macd_last - signal_last
    macd_prev   = macd_series[-2] if len(macd_series) >= 2 else macd_last
    signal_prev = signal_series[-2] if len(signal_series) >= 2 else signal_last
    prev_hist   = macd_prev - signal_prev
    sinal_cruz  = 'alta' if (hist > 0 and prev_hist <= 0) else 'baixa' if (hist < 0 and prev_hist >= 0) else 'sem'
    return {"macd": macd_last, "sinal": signal_last, "histograma": hist, "sinalCruz": sinal_cruz}

def calcular_bollinger(prices, period=20, mult=2):
    if len(prices) < period:
        return None
    sl   = prices[-period:]
    m    = media(sl)
    dp   = desv_pad(sl)
    return {"media": m, "superior": m + mult * dp, "inferior": m - mult * dp, "taxa": prices[-1]}

# ── Janelas e fluxos mensais ───────────────────────────────────────────────────
def get_janela(dia):
    if dia <=  5: return '1-5'
    if dia <= 10: return '6-10'
    if dia <= 15: return '11-15'
    if dia <= 20: return '16-20'
    if dia <= 25: return '21-25'
    return '26-31'

def encontrar_proxima_otima(dia_atual, data_hoje, por_janela, prob_atual, max_dias):
    janelas = [
        {'nome': '1-5',   'inicio': 1},
        {'nome': '6-10',  'inicio': 6},
        {'nome': '11-15', 'inicio': 11},
        {'nome': '16-20', 'inicio': 16},
        {'nome': '21-25', 'inicio': 21},
        {'nome': '26-31', 'inicio': 26},
    ]
    limite = data_hoje + datetime.timedelta(days=max_dias)

    for meses_a_frente in range(5):
        ano  = data_hoje.year
        mes  = data_hoje.month + meses_a_frente
        while mes > 12:
            mes -= 12
            ano += 1
        mes_nome = MESES_NOME[mes - 1]
        prob_mes = por_janela.get(mes_nome, {})

        for j in janelas:
            try:
                data_inicio = datetime.date(ano, mes, j['inicio'])
            except ValueError:
                continue
            if data_inicio <= data_hoje:
                continue
            if data_inicio > limite:
                return None
            prob = prob_mes.get(j['nome'], 0)
            if prob - prob_atual < 3:
                continue
            dias = (data_inicio - data_hoje).days
            return {'janela': j['nome'], 'prob': prob, 'dias': dias, 'mes': mes_nome}
    return None

# ── Score ──────────────────────────────────────────────────────────────────────
def calcular_score(tendencia, forca_tendencia, prob_atual, prob_max,
                   proxima_otima, flexibilidade, rsi, macd_sinal_cruz, boll_pos):
    score = 50

    # Fluxos mensais
    if proxima_otima and proxima_otima['dias'] <= flexibilidade:
        ganho   = proxima_otima['prob'] - prob_atual
        urgencia = 1.6 if proxima_otima['dias'] <= 3 else 1.2 if proxima_otima['dias'] <= 7 else 1.0
        score += min(round(ganho * urgencia), 40)
    elif prob_atual >= 30 and prob_atual / max(prob_max, 1) >= 0.85:
        score -= 15
    else:
        bonus_flex = min((flexibilidade // 20) * 3, 6)
        score += bonus_flex - 3

    # Tendência
    diff_ma = tendencia  # já em %
    if diff_ma > 0.2:
        score += 12
    elif diff_ma < -0.2:
        score -= 12

    # RSI
    tech = 0
    if rsi is not None:
        if rsi > 70:   tech -= 10
        elif rsi < 30: tech += 10

    # MACD
    if macd_sinal_cruz == 'alta':  tech += 8
    elif macd_sinal_cruz == 'baixa': tech -= 8

    # Bollinger
    if boll_pos is not None:
        if boll_pos > 0.80:   tech -= 6
        elif boll_pos < 0.20: tech += 6

    score += max(-20, min(20, tech))
    return max(0, min(100, score))

def recomendacao_de_score(score):
    if score >= 65:  return 'AGUARDAR'
    if score <= 35:  return 'CONVERTER'
    return 'PARCIAL'

# ── Backtesting principal ──────────────────────────────────────────────────────
def run_backtest(series, historico):
    taxas_all  = [d['taxa'] for d in series]
    datas_all  = [d['data'] for d in series]
    n          = len(taxas_all)
    por_janela = historico['por_janela']

    results = []

    for i in range(WARMUP, n):
        taxa_hoje = taxas_all[i]
        data_str  = datas_all[i]
        data_hoje = datetime.date.fromisoformat(data_str)

        # Janela de preços até hoje (inclusive)
        window = taxas_all[:i+1]

        # Indicadores técnicos
        rsi  = calcular_rsi(window, 14)
        macd = calcular_macd(window, 12, 26, 9)
        boll = calcular_bollinger(window, 20, 2)

        # Tendência vs MA20
        ma20     = media(window[-20:])
        diff_ma  = (taxa_hoje - ma20) / ma20 * 100
        tendencia = diff_ma

        # Volatilidade diária (últimos 20 dias, retornos)
        ret_20 = [(window[-20+j+1] - window[-20+j]) / window[-20+j] for j in range(19)]
        vol_diaria = desv_pad(ret_20) if len(ret_20) >= 2 else 0.005

        # Fluxos mensais
        mes_nome  = MESES_NOME[data_hoje.month - 1]
        dia       = data_hoje.day
        janela    = get_janela(dia)
        prob_mes  = por_janela.get(mes_nome, {})
        prob_atual = prob_mes.get(janela, 0)
        prob_max   = max(prob_mes.values()) if prob_mes else 1
        proxima_otima = encontrar_proxima_otima(dia, data_hoje, por_janela, prob_atual, FLEXIBILIDADE)

        # Bollinger position (0-1)
        boll_pos = None
        if boll:
            rng = boll['superior'] - boll['inferior']
            boll_pos = (taxa_hoje - boll['inferior']) / rng if rng > 0 else 0.5

        # MACD sinal
        macd_sinal = macd['sinalCruz'] if macd else 'sem'

        # Score
        score = calcular_score(
            tendencia, abs(tendencia), prob_atual, prob_max,
            proxima_otima, FLEXIBILIDADE, rsi, macd_sinal, boll_pos
        )
        rec = recomendacao_de_score(score)

        # Taxas futuras
        taxa_7d  = taxas_all[i + 7]  if i + 7  < n else None
        taxa_15d = taxas_all[i + 15] if i + 15 < n else None
        taxa_30d = taxas_all[i + 30] if i + 30 < n else None

        # Variações reais
        var_7d  = (taxa_7d  - taxa_hoje) / taxa_hoje * 100 if taxa_7d  else None
        var_15d = (taxa_15d - taxa_hoje) / taxa_hoje * 100 if taxa_15d else None
        var_30d = (taxa_30d - taxa_hoje) / taxa_hoje * 100 if taxa_30d else None

        results.append({
            'data':        data_str,
            'taxa':        taxa_hoje,
            'score':       score,
            'rec':         rec,
            'rsi':         rsi,
            'macd_sinal':  macd_sinal,
            'boll_pos':    boll_pos,
            'prob_atual':  prob_atual,
            'prob_max':    prob_max,
            'tendencia':   tendencia,
            'vol_diaria':  vol_diaria,
            'var_7d':      var_7d,
            'var_15d':     var_15d,
            'var_30d':     var_30d,
        })

    return results

# ── Métricas ───────────────────────────────────────────────────────────────────
def calcular_metricas(results):
    metricas = {}

    # 1. Acuidade do score: AGUARDAR (score≥65) → taxa subiu?
    aguardar = [r for r in results if r['rec'] == 'AGUARDAR']
    converter = [r for r in results if r['rec'] == 'CONVERTER']
    parcial  = [r for r in results if r['rec'] == 'PARCIAL']

    def pct_subiu(lst, campo):
        vals = [r[campo] for r in lst if r[campo] is not None]
        if not vals: return None, 0
        return sum(1 for v in vals if v > 0) / len(vals) * 100, len(vals)

    def pct_desceu(lst, campo):
        vals = [r[campo] for r in lst if r[campo] is not None]
        if not vals: return None, 0
        return sum(1 for v in vals if v < 0) / len(vals) * 100, len(vals)

    def media_var(lst, campo):
        vals = [r[campo] for r in lst if r[campo] is not None]
        return media(vals) if vals else None

    metricas['aguardar'] = {
        'n': len(aguardar),
        'pct_subiu_7d':  pct_subiu(aguardar, 'var_7d'),
        'pct_subiu_15d': pct_subiu(aguardar, 'var_15d'),
        'pct_subiu_30d': pct_subiu(aguardar, 'var_30d'),
        'media_var_7d':  media_var(aguardar, 'var_7d'),
        'media_var_15d': media_var(aguardar, 'var_15d'),
        'media_var_30d': media_var(aguardar, 'var_30d'),
    }
    metricas['converter'] = {
        'n': len(converter),
        'pct_desceu_7d':  pct_desceu(converter, 'var_7d'),
        'pct_desceu_15d': pct_desceu(converter, 'var_15d'),
        'pct_desceu_30d': pct_desceu(converter, 'var_30d'),
        'media_var_7d':   media_var(converter, 'var_7d'),
        'media_var_15d':  media_var(converter, 'var_15d'),
        'media_var_30d':  media_var(converter, 'var_30d'),
    }

    # 2. RSI signals
    rsi_overbought = [r for r in results if r['rsi'] is not None and r['rsi'] > 70]
    rsi_oversold   = [r for r in results if r['rsi'] is not None and r['rsi'] < 30]

    metricas['rsi_overbought'] = {
        'n': len(rsi_overbought),
        'pct_desceu_7d':  pct_desceu(rsi_overbought, 'var_7d'),
        'pct_desceu_15d': pct_desceu(rsi_overbought, 'var_15d'),
        'media_var_7d':   media_var(rsi_overbought, 'var_7d'),
        'media_var_15d':  media_var(rsi_overbought, 'var_15d'),
    }
    metricas['rsi_oversold'] = {
        'n': len(rsi_oversold),
        'pct_subiu_7d':  pct_subiu(rsi_oversold, 'var_7d'),
        'pct_subiu_15d': pct_subiu(rsi_oversold, 'var_15d'),
        'media_var_7d':  media_var(rsi_oversold, 'var_7d'),
        'media_var_15d': media_var(rsi_oversold, 'var_15d'),
    }

    # 3. Fluxos mensais: quando prob_atual>=30%, a taxa foi acima da média?
    alto_fluxo = [r for r in results if r['prob_atual'] >= 30]
    baixo_fluxo = [r for r in results if r['prob_atual'] < 15]
    metricas['fluxos_alto'] = {
        'n': len(alto_fluxo),
        'pct_subiu_7d':  pct_subiu(alto_fluxo, 'var_7d'),
        'pct_subiu_15d': pct_subiu(alto_fluxo, 'var_15d'),
        'media_var_7d':  media_var(alto_fluxo, 'var_7d'),
        'media_var_15d': media_var(alto_fluxo, 'var_15d'),
    }
    metricas['fluxos_baixo'] = {
        'n': len(baixo_fluxo),
        'pct_subiu_7d':  pct_subiu(baixo_fluxo, 'var_7d'),
        'pct_subiu_15d': pct_subiu(baixo_fluxo, 'var_15d'),
        'media_var_7d':  media_var(baixo_fluxo, 'var_7d'),
        'media_var_15d': media_var(baixo_fluxo, 'var_15d'),
    }

    # Correlação prob_atual vs var_7d
    pares = [(r['prob_atual'], r['var_7d']) for r in results if r['var_7d'] is not None]
    if len(pares) > 10:
        xs = [p[0] for p in pares]
        ys = [p[1] for p in pares]
        mx, my = media(xs), media(ys)
        cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / len(xs)
        sx  = desv_pad(xs)
        sy  = desv_pad(ys)
        corr = cov / (sx * sy) if sx * sy > 0 else 0
        metricas['fluxos_correlacao_7d'] = corr
    else:
        metricas['fluxos_correlacao_7d'] = None

    # 4. Calibração do cone de volatilidade
    dentro_1sigma = 0
    dentro_2sigma = 0
    n_cone = 0
    for r in results:
        if r['var_7d'] is None or r['vol_diaria'] <= 0:
            continue
        sigma_7 = r['vol_diaria'] * math.sqrt(7) * 100  # em %
        var = r['var_7d']
        n_cone += 1
        if abs(var) <= sigma_7:     dentro_1sigma += 1
        if abs(var) <= 2 * sigma_7: dentro_2sigma += 1

    metricas['cone'] = {
        'n': n_cone,
        'pct_dentro_1sigma': dentro_1sigma / n_cone * 100 if n_cone else None,
        'pct_dentro_2sigma': dentro_2sigma / n_cone * 100 if n_cone else None,
        'esperado_1sigma': 68.3,
        'esperado_2sigma': 95.4,
    }

    # 5. Score-to-outcome: correlação entre score e var_7d
    pares_score = [(r['score'], r['var_7d']) for r in results if r['var_7d'] is not None]
    if len(pares_score) > 10:
        xs = [p[0] for p in pares_score]
        ys = [p[1] for p in pares_score]
        mx, my = media(xs), media(ys)
        cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / len(xs)
        sx  = desv_pad(xs)
        sy  = desv_pad(ys)
        corr = cov / (sx * sy) if sx * sy > 0 else 0
        metricas['score_correlacao_7d'] = corr
    else:
        metricas['score_correlacao_7d'] = None

    # Distribuição de scores
    metricas['dist_scores'] = {
        'aguardar': len(aguardar),
        'parcial':  len(parcial),
        'converter': len(converter),
        'total':    len(results),
    }

    # Score médio por decil vs var_7d média
    decis = {}
    for r in results:
        if r['var_7d'] is None: continue
        d = min(r['score'] // 10, 9)
        if d not in decis: decis[d] = []
        decis[d].append(r['var_7d'])
    metricas['score_decis'] = {str(d*10)+'-'+str(d*10+9): round(media(v), 4) for d, v in sorted(decis.items())}

    return metricas

# ── Geração do relatório ───────────────────────────────────────────────────────
def gerar_relatorio(results, metricas, fonte):
    linhas = []
    A = linhas.append

    A("# Backtest de Validação — Score USD→EUR")
    A("")
    A(f"**Gerado em:** {datetime.date.today().isoformat()}  ")
    A(f"**Fonte de dados:** {fonte}  ")
    A(f"**Período analisado:** {results[0]['data']} → {results[-1]['data']}  ")
    A(f"**Total de dias com dados:** {len(results)}  ")
    A(f"**Flexibilidade (backtest):** {FLEXIBILIDADE} dias  ")
    A(f"**Warmup:** {WARMUP} dias  ")
    A("")

    # ── 1. Acuidade do score ───────────────────────────────────────────────────
    A("## 1. Acuidade do Score")
    A("")
    A("### AGUARDAR (score ≥ 65)")
    ag = metricas['aguardar']
    A(f"- **N** de dias classificados: {ag['n']}")
    p7,  n7  = ag['pct_subiu_7d']
    p15, n15 = ag['pct_subiu_15d']
    p30, n30 = ag['pct_subiu_30d']
    if p7  is not None: A(f"- Taxa subiu em +7d:  **{p7:.1f}%** ({n7} obs) — variação média {ag['media_var_7d']:+.3f}%")
    if p15 is not None: A(f"- Taxa subiu em +15d: **{p15:.1f}%** ({n15} obs) — variação média {ag['media_var_15d']:+.3f}%")
    if p30 is not None: A(f"- Taxa subiu em +30d: **{p30:.1f}%** ({n30} obs) — variação média {ag['media_var_30d']:+.3f}%")
    A("")
    A("> Referência aleatória: 50%. Acima de 55% indica sinal útil.")
    A("")

    A("### CONVERTER (score ≤ 35)")
    cv = metricas['converter']
    A(f"- **N** de dias classificados: {cv['n']}")
    p7,  n7  = cv['pct_desceu_7d']
    p15, n15 = cv['pct_desceu_15d']
    p30, n30 = cv['pct_desceu_30d']
    if p7  is not None: A(f"- Taxa desceu em +7d:  **{p7:.1f}%** ({n7} obs) — variação média {cv['media_var_7d']:+.3f}%")
    if p15 is not None: A(f"- Taxa desceu em +15d: **{p15:.1f}%** ({n15} obs) — variação média {cv['media_var_15d']:+.3f}%")
    if p30 is not None: A(f"- Taxa desceu em +30d: **{p30:.1f}%** ({n30} obs) — variação média {cv['media_var_30d']:+.3f}%")
    A("")

    A("### Distribuição de recomendações")
    ds = metricas['dist_scores']
    A(f"| Recomendação | N | % |")
    A(f"|---|---|---|")
    A(f"| AGUARDAR  | {ds['aguardar']}  | {ds['aguardar']/ds['total']*100:.1f}% |")
    A(f"| PARCIAL   | {ds['parcial']}   | {ds['parcial']/ds['total']*100:.1f}% |")
    A(f"| CONVERTER | {ds['converter']} | {ds['converter']/ds['total']*100:.1f}% |")
    A(f"| **Total** | **{ds['total']}** | 100% |")
    A("")

    # ── 2. Score-to-outcome ────────────────────────────────────────────────────
    A("## 2. Score-to-Outcome (correlação score vs variação real +7d)")
    A("")
    corr = metricas['score_correlacao_7d']
    if corr is not None:
        A(f"**Correlação de Pearson score↔variação +7d:** {corr:+.4f}")
        A("")
        if abs(corr) < 0.05:
            interpretacao = "Correlação negligenciável — score praticamente sem poder preditivo a 7 dias."
        elif abs(corr) < 0.15:
            interpretacao = "Correlação fraca — sinal existe mas é ruidoso."
        elif abs(corr) < 0.30:
            interpretacao = "Correlação moderada — score tem utilidade preditiva real."
        else:
            interpretacao = "Correlação forte — score é bom preditor."
        A(f"> {interpretacao}")
        A("")
    A("### Variação média real por decil de score")
    A("")
    A("| Decil de score | Variação média +7d |")
    A("|---|---|")
    for decil, v in metricas['score_decis'].items():
        A(f"| {decil} | {v:+.4f}% |")
    A("")
    A("> Esperado: decis altos (score≥70) devem ter variação positiva; decis baixos (score≤30) devem ter variação negativa.")
    A("")

    # ── 3. RSI ─────────────────────────────────────────────────────────────────
    A("## 3. Análise do RSI")
    A("")
    ob = metricas['rsi_overbought']
    os_ = metricas['rsi_oversold']
    A(f"### RSI > 70 (sobrecomprado — sinal de venda/converter)")
    A(f"- N de ocorrências: {ob['n']}")
    if ob['n'] > 0:
        p7,  n7  = ob['pct_desceu_7d']
        p15, n15 = ob['pct_desceu_15d']
        if p7  is not None: A(f"- Taxa desceu em +7d:  **{p7:.1f}%** ({n7} obs) — variação média {ob['media_var_7d']:+.3f}%")
        if p15 is not None: A(f"- Taxa desceu em +15d: **{p15:.1f}%** ({n15} obs) — variação média {ob['media_var_15d']:+.3f}%")
    A("")
    A(f"### RSI < 30 (sobrevendido — sinal de espera/aguardar)")
    A(f"- N de ocorrências: {os_['n']}")
    if os_['n'] > 0:
        p7,  n7  = os_['pct_subiu_7d']
        p15, n15 = os_['pct_subiu_15d']
        if p7  is not None: A(f"- Taxa subiu em +7d:  **{p7:.1f}%** ({n7} obs) — variação média {os_['media_var_7d']:+.3f}%")
        if p15 is not None: A(f"- Taxa subiu em +15d: **{p15:.1f}%** ({n15} obs) — variação média {os_['media_var_15d']:+.3f}%")
    A("")

    # ── 4. Fluxos mensais ──────────────────────────────────────────────────────
    A("## 4. Poder Preditivo dos Fluxos Mensais")
    A("")
    af = metricas['fluxos_alto']
    bf = metricas['fluxos_baixo']
    A(f"### Janelas de alto fluxo (prob_atual ≥ 30%)")
    A(f"- N de dias: {af['n']}")
    if af['n'] > 0:
        p7,  n7  = af['pct_subiu_7d']
        p15, n15 = af['pct_subiu_15d']
        if p7  is not None: A(f"- Taxa subiu em +7d:  **{p7:.1f}%** ({n7} obs) — variação média {af['media_var_7d']:+.3f}%")
        if p15 is not None: A(f"- Taxa subiu em +15d: **{p15:.1f}%** ({n15} obs) — variação média {af['media_var_15d']:+.3f}%")
    A("")
    A(f"### Janelas de baixo fluxo (prob_atual < 15%)")
    A(f"- N de dias: {bf['n']}")
    if bf['n'] > 0:
        p7,  n7  = bf['pct_subiu_7d']
        p15, n15 = bf['pct_subiu_15d']
        if p7  is not None: A(f"- Taxa subiu em +7d:  **{p7:.1f}%** ({n7} obs) — variação média {bf['media_var_7d']:+.3f}%")
        if p15 is not None: A(f"- Taxa subiu em +15d: **{p15:.1f}%** ({n15} obs) — variação média {bf['media_var_15d']:+.3f}%")
    A("")
    corr_f = metricas['fluxos_correlacao_7d']
    if corr_f is not None:
        A(f"**Correlação prob_atual ↔ variação +7d:** {corr_f:+.4f}")
        A("")
        if abs(corr_f) < 0.05:
            A("> Correlação negligenciável — fluxos mensais históricos não têm poder preditivo sobre a taxa nos 7 dias seguintes.")
        elif corr_f > 0:
            A("> Correlação positiva — janelas de alta probabilidade BCE tendem a coincidir com taxas mais altas.")
        else:
            A("> Correlação negativa (contra-intuitiva) — investigar se a lógica do indicador está invertida.")
    A("")

    # ── 5. Cone de volatilidade ────────────────────────────────────────────────
    A("## 5. Calibração do Cone de Volatilidade")
    A("")
    cone = metricas['cone']
    A(f"- N de dias testados: {cone['n']}")
    if cone['pct_dentro_1sigma'] is not None:
        A(f"- Dentro ±1σ√7: **{cone['pct_dentro_1sigma']:.1f}%** (esperado ≈68.3%)")
        A(f"- Dentro ±2σ√7: **{cone['pct_dentro_2sigma']:.1f}%** (esperado ≈95.4%)")
        A("")
        ratio_1 = cone['pct_dentro_1sigma'] / 68.3
        ratio_2 = cone['pct_dentro_2sigma'] / 95.4
        if ratio_1 < 0.80:
            A("> **Sub-estimação severa de volatilidade** — o cone é demasiado estreito (fat tails não capturadas).")
        elif ratio_1 < 0.92:
            A("> **Sub-estimação moderada** — cone ligeiramente estreito, considerar multiplicador > 1.")
        elif ratio_1 > 1.15:
            A("> **Sobre-estimação** — cone demasiado largo, volatilidade exagerada.")
        else:
            A("> Cone bem calibrado para ±1σ.")

        if ratio_2 < 0.90:
            A("> **±2σ também sub-estimado** — a distribuição de retornos tem caudas mais pesadas do que a normal (leptocúrtica).")
        elif ratio_2 > 1.05:
            A("> **±2σ sobre-estimado** — distribuição mais estreita do que o normal.")
        else:
            A("> Cone de ±2σ adequado.")
    A("")

    # ── 6. Recomendações ──────────────────────────────────────────────────────
    A("## 6. Recomendações de Melhoria")
    A("")

    # RSI
    rsi_ob_n = ob['n']
    rsi_os_n = os_['n']
    rsi_ob_p7 = ob['pct_desceu_7d'][0] if ob['n'] > 0 else None
    rsi_os_p7 = os_['pct_subiu_7d'][0] if os_['n'] > 0 else None

    A("### Fluxos Mensais (prob_atual)")
    corr_f_val = metricas['fluxos_correlacao_7d'] or 0
    if abs(corr_f_val) < 0.05:
        A("- **Poder preditivo negligenciável.** A probabilidade histórica BCE por janela de 5 dias não tem correlação mensurável com a variação real da taxa nos 7 dias seguintes.")
        A("- **Recomendação:** Reduzir o peso deste indicador no score de 40pp para ≤15pp, ou convertê-lo num filtro secundário em vez de factor primário.")
        A("- A metodologia top-25% por janela de 5 dias pode estar a capturar ruído histórico em vez de padrão genuíno.")
    elif abs(corr_f_val) < 0.10:
        A("- **Poder preditivo fraco.** Existe sinal mas é muito ruidoso.")
        A("- **Recomendação:** Manter mas reduzir o peso máximo de 40pp para ≤20pp.")
    else:
        A("- Fluxos mensais mostram correlação razoável — manter peso actual.")
    A("")

    A("### RSI")
    if rsi_ob_p7 is not None and rsi_os_p7 is not None:
        rsi_util = (rsi_ob_p7 > 55 or (100 - rsi_ob_p7) > 55) and (rsi_os_p7 > 55 or (100 - rsi_os_p7) > 55)
        if rsi_util:
            A(f"- RSI mostrou sinal útil: sobrecomprado→desceu {rsi_ob_p7:.0f}% das vezes; sobrevendido→subiu {rsi_os_p7:.0f}% das vezes.")
            A("- **Recomendação:** Manter RSI com peso actual (±10pp).")
        else:
            A(f"- RSI fraco neste par: sobrecomprado→desceu apenas {rsi_ob_p7:.0f}% (esperado >60%); sobrevendido→subiu {rsi_os_p7:.0f}%.")
            A("- **Recomendação:** Reduzir peso do RSI de ±10pp para ±5pp, ou usar período mais curto (RSI-7 em vez de RSI-14).")
            A("- USD/EUR é influenciado principalmente por diferenciais de taxa BCE/Fed — RSI pode ser menos fiável que em acções.")
    else:
        A("- Dados insuficientes para avaliar RSI.")
    A("")

    A("### Cone de Volatilidade")
    if cone['pct_dentro_1sigma'] is not None:
        ratio = cone['pct_dentro_1sigma'] / 68.3
        if ratio < 0.85:
            A(f"- **Cone sub-estimado:** {cone['pct_dentro_1sigma']:.1f}% dentro ±1σ vs esperado 68.3%.")
            A("- **Recomendação:** Aplicar multiplicador de expansão de ~1.3-1.5× à volatilidade diária no cone.")
            A("- Alternativa: usar volatilidade EWMA (pesos exponenciais) em vez de desvio-padrão simples dos últimos 20 dias.")
        elif ratio > 1.10:
            A(f"- Cone sobre-estimado: {cone['pct_dentro_1sigma']:.1f}% vs esperado 68.3% — reduzir multiplicador.")
        else:
            A(f"- Cone bem calibrado: {cone['pct_dentro_1sigma']:.1f}% dentro ±1σ (esperado 68.3%). Nenhuma acção necessária.")
    A("")

    A("### Score-to-Outcome")
    corr_s = metricas['score_correlacao_7d'] or 0
    if abs(corr_s) < 0.05:
        A(f"- **Correlação score↔variação +7d quase nula ({corr_s:+.4f}).** O score actual não prevê consistentemente a direcção da taxa.")
        A("- **Recomendação prioritária:** Rever a fórmula de score — especialmente o peso dos fluxos mensais (até 40pp) que parece dominar o score sem poder preditivo real.")
        A("- Considerar basear o score principalmente em RSI + MACD + Bollinger (indicadores técnicos com fundamento matemático) e tratar fluxos como factor de ajuste secundário.")
    elif corr_s > 0.10:
        A(f"- Correlação positiva razoável ({corr_s:+.4f}) — score tem algum poder preditivo real.")
        A("- **Recomendação:** Optimizar os pesos actuais via regressão logística sobre o histórico de backtest.")
    else:
        A(f"- Correlação modesta ({corr_s:+.4f}) — margem de melhoria significativa.")
    A("")

    A("### Melhorias Adicionais Recomendadas")
    A("")
    A("1. **Diferencial de taxas BCE/Fed em tempo real:** O factor mais determinante do USD/EUR nos últimos anos é a diferença entre a taxa directora do Fed e do BCE. Incorporar este diferencial directamente no score (ex: Fed rate − BCE rate > 1pp → pressão para USD forte).")
    A("2. **Tendência de médio prazo (MA50 vs MA200):** Filtrar os sinais de curto prazo com a tendência macro. Se USD está em tendência de baixa a 200 dias, sinal de AGUARDAR merece mais peso.")
    A("3. **Volatilidade adaptativa:** Usar janela de volatilidade mais curta (10 dias) quando mercado está em stress (vol > percentil 80 histórico).")
    A("4. **Backtesting com custo de oportunidade:** Incorporar o diferencial de juros USD/EUR — esperar tem custo real diário quando juro USD > juro EUR.")
    A("")

    A("---")
    A(f"*Relatório gerado por `scripts/backtest.py` em {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}*")

    return '\n'.join(linhas)


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    # 1. Descarregar dados
    series = fetch_bce(DATE_FROM)
    if series:
        fonte = f"BCE via Frankfurter.dev (descarregado em {datetime.date.today().isoformat()}), {len(series)} observações"
        print(f"Dados BCE descarregados: {len(series)} observações ({series[0]['data']} → {series[-1]['data']})", flush=True)
    else:
        print("AVISO: Download falhou. A usar latest.json como fallback.", flush=True)
        series = load_latest_fallback()
        fonte = "data/latest.json (fallback — dados limitados)"
        if not series:
            print("ERRO: Sem dados disponíveis. Abortar.", flush=True)
            sys.exit(1)

    # 2. Carregar historico.json
    historico = load_historico()
    print(f"Histórico BCE carregado: {historico.get('observacoes', '?')} observações", flush=True)

    # 3. Backtest
    print(f"A correr backtest ({len(series)} dias de série, warmup={WARMUP})...", flush=True)
    results = run_backtest(series, historico)
    print(f"Backtest concluído: {len(results)} dias analisados.", flush=True)

    # 4. Métricas
    metricas = calcular_metricas(results)

    # 5. Gerar relatório
    report = gerar_relatorio(results, metricas, fonte)

    # 6. Guardar
    out_path = Path(__file__).parent / "backtest_report.md"
    out_path.write_text(report, encoding='utf-8')
    print(f"\nRelatório guardado em: {out_path}", flush=True)

    # 7. Resumo no terminal
    print("\n" + "="*60, flush=True)
    print("RESUMO EXECUTIVO", flush=True)
    print("="*60, flush=True)
    ag = metricas['aguardar']
    cv = metricas['converter']
    p_ag_7 = ag['pct_subiu_7d'][0]
    p_cv_7 = cv['pct_desceu_7d'][0]
    print(f"AGUARDAR (n={ag['n']}): taxa subiu +7d em {p_ag_7:.1f}% (base=50%)", flush=True)
    print(f"CONVERTER (n={cv['n']}): taxa desceu +7d em {p_cv_7:.1f}% (base=50%)", flush=True)
    print(f"Score↔variação +7d: r={metricas['score_correlacao_7d']:+.4f}", flush=True)
    print(f"Fluxos↔variação +7d: r={metricas['fluxos_correlacao_7d']:+.4f}", flush=True)
    cone = metricas['cone']
    print(f"Cone ±1σ: {cone['pct_dentro_1sigma']:.1f}% (esperado 68.3%)", flush=True)
    print(f"Cone ±2σ: {cone['pct_dentro_2sigma']:.1f}% (esperado 95.4%)", flush=True)
    print("="*60, flush=True)


if __name__ == "__main__":
    main()
