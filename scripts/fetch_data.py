#!/usr/bin/env python3
"""
Fetches daily USD/EUR data from Frankfurter (ECB) and Wise public API.
Runs in GitHub Actions. Updates data/latest.json and data/predicoes.json.
"""
import json
import math
import urllib.request
import urllib.parse
import datetime
from pathlib import Path


# ── Helpers de score (espelho da lógica em analise.js) ────────

def _media(arr):
    return sum(arr) / len(arr) if arr else 0

def _calcular_rsi(prices, period=14):
    if len(prices) < period + 1:
        return None
    gains, losses = 0.0, 0.0
    for i in range(1, period + 1):
        d = prices[i] - prices[i - 1]
        if d > 0: gains += d
        else: losses += abs(d)
    avg_gain = gains / period
    avg_loss = losses / period
    for i in range(period + 1, len(prices)):
        d = prices[i] - prices[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(d, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-d, 0)) / period
    if avg_loss == 0:
        return 100.0
    return 100 - 100 / (1 + avg_gain / avg_loss)

def _get_janela(dia):
    if dia <=  5: return '1-5'
    if dia <= 10: return '6-10'
    if dia <= 15: return '11-15'
    if dia <= 20: return '16-20'
    if dia <= 25: return '21-25'
    return '26-31'

def _encontrar_proxima_otima(hoje, por_janela, prob_atual, max_dias=15):
    MESES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    JANELAS = [('1-5',1),('6-10',6),('11-15',11),('16-20',16),('21-25',21),('26-31',26)]
    limite = hoje + datetime.timedelta(days=max_dias)
    for m_off in range(5):
        total = hoje.month - 1 + m_off
        ano   = hoje.year + total // 12
        mes   = total % 12 + 1
        mes_nome = MESES[mes - 1]
        prob_mes = por_janela.get(mes_nome, {})
        for nome, inicio in JANELAS:
            try:
                d_ini = datetime.date(ano, mes, inicio)
                d_fim = datetime.date(ano, mes, inicio + 4)
            except ValueError:
                continue
            if d_fim < hoje: continue
            if d_ini > limite: return None
            prob = prob_mes.get(nome, 0)
            if prob - prob_atual >= 3:
                return {'janela': nome, 'prob': prob,
                        'dias': max((d_ini - hoje).days, 0), 'mes': mes_nome}
    return None

def calcular_score(taxas, taxa_atual, por_janela, hoje_date, flexibilidade=15):
    """Espelho simplificado de calcularRecomendacao() em analise.js."""
    if len(taxas) < 20:
        return 50, 'PARCIAL'

    ma20     = _media(taxas[-20:])
    diff_ma  = (taxa_atual - ma20) / ma20 * 100
    rsi      = _calcular_rsi(taxas, 14)

    MESES    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    mes_nome = MESES[hoje_date.month - 1]
    janela   = _get_janela(hoje_date.day)
    probs    = por_janela.get(mes_nome, {})
    prob_atual = probs.get(janela, 0)
    prob_max   = max(probs.values()) if probs else 1
    proxima    = _encontrar_proxima_otima(hoje_date, por_janela, prob_atual, flexibilidade)

    score = 50

    # Fluxos mensais
    if proxima and proxima['dias'] <= flexibilidade:
        ganho   = proxima['prob'] - prob_atual
        urg     = 1.6 if proxima['dias'] <= 3 else 1.2 if proxima['dias'] <= 7 else 1.0
        score  += min(round(ganho * urg), 40)
    elif prob_atual >= 30 and prob_max > 0 and prob_atual / prob_max >= 0.85:
        score  -= 15
    else:
        bonus   = min((flexibilidade // 20) * 3, 6)
        score  += bonus - 3

    # Tendência
    if diff_ma > 0.2:   score += 12
    elif diff_ma < -0.2: score -= 12

    # RSI
    tech = 0
    if rsi is not None:
        if rsi > 70: tech -= 10
        elif rsi < 30: tech += 10
    score += max(-20, min(20, tech))
    score  = max(0, min(100, score))

    if score >= 65:  decisao = 'AGUARDAR'
    elif score <= 35: decisao = 'CONVERTER'
    else:             decisao = 'PARCIAL'

    return score, decisao


# ── Tracking de previsões ──────────────────────────────────────

def actualizar_predicoes(hoje_date, taxa_atual, score, decisao, rates):
    """
    Carrega predicoes.json, preenche outcomes de entradas ≥7 dias,
    adiciona entrada de hoje, calcula acuidade diária/semanal/mensal.
    Retorna dict com métricas de acuidade.
    """
    path = Path("data/predicoes.json")
    try:
        with open(path) as f:
            predicoes = json.load(f)
    except Exception:
        predicoes = []

    # Lookup: data ISO → taxa
    taxa_por_data = {r['data']: r['taxa'] for r in rates}

    # Preencher outcomes de entradas com ≥7 dias
    for p in predicoes:
        if p.get('correto_7d') is not None:
            continue
        d_pred = datetime.date.fromisoformat(p['data'])
        if (hoje_date - d_pred).days < 7:
            continue
        # Taxa real a +7 dias (aceita até +4 dias extra para fim-de-semana / feriados)
        taxa_7d = None
        for delta in range(7, 12):
            chave = (d_pred + datetime.timedelta(days=delta)).isoformat()
            if chave in taxa_por_data:
                taxa_7d = taxa_por_data[chave]
                break
        if taxa_7d is None:
            continue
        p['taxa_7d'] = taxa_7d
        # PARCIAL exclui-se da métrica (sinal misto — não avaliamos)
        if p['decisao'] == 'AGUARDAR':
            p['correto_7d'] = taxa_7d > p['taxa']
        elif p['decisao'] == 'CONVERTER':
            p['correto_7d'] = taxa_7d <= p['taxa']
        else:
            p['correto_7d'] = None  # PARCIAL → excluído

    # Adicionar entrada de hoje (sem duplicar)
    hoje_str = hoje_date.isoformat()
    if not any(p['data'] == hoje_str for p in predicoes):
        predicoes.append({
            'data': hoje_str,
            'taxa': taxa_atual,
            'score': score,
            'decisao': decisao,
            'taxa_7d': None,
            'correto_7d': None,
        })

    predicoes = predicoes[-90:]  # ~3 meses

    path.parent.mkdir(exist_ok=True)
    with open(path, 'w') as f:
        json.dump(predicoes, f, indent=2)

    # Acuidade — apenas entradas com outcome definido (sem PARCIAL)
    def _acuidade(entries):
        valid = [p for p in entries if p.get('correto_7d') is not None]
        if not valid:
            return {'n': 0, 'corretos': 0, 'pct': None}
        corretos = sum(1 for p in valid if p['correto_7d'])
        return {'n': len(valid), 'corretos': corretos,
                'pct': round(corretos / len(valid), 3)}

    com_outcome = [p for p in predicoes if p.get('correto_7d') is not None]
    return {
        'dia':   _acuidade(com_outcome[-1:]),   # último dia útil com outcome
        'semana': _acuidade(com_outcome[-5:]),   # ~5 dias úteis
        'mes':   _acuidade(com_outcome[-20:]),   # ~1 mês
        'total': _acuidade(com_outcome),
    }


# ── Fetch BCE e Wise ──────────────────────────────────────────

def fetch_frankfurter(days=200):
    end   = datetime.date.today()
    start = end - datetime.timedelta(days=days)
    url   = f"https://api.frankfurter.dev/v2/rates?from={start}&to={end}&base=USD&quotes=EUR"
    req   = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    if isinstance(data, list):
        rates = [{"data": d["date"], "taxa": round(d["rate"], 6)}
                 for d in sorted(data, key=lambda x: x["date"])]
    else:
        rates = []
        for date_str, values in sorted(data.get("data", {}).items()):
            if "EUR" in values:
                rates.append({"data": date_str, "taxa": round(values["EUR"], 6)})
    return rates


def fetch_wise(amount, pais_origem="GB", pais_destino="DE"):
    params = urllib.parse.urlencode({
        "sourceCurrency": "USD", "targetCurrency": "EUR",
        "sendAmount": amount,
        "sourceCountry": pais_origem, "targetCountry": pais_destino,
    })
    url = f"https://api.wise.com/v3/comparisons/?{params}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        for provider in data.get("providers", []):
            if provider.get("alias") == "wise":
                quotes = provider.get("quotes", [])
                quote  = next((q for q in quotes if q.get("markup", 1) == 0.0),
                               quotes[0] if quotes else None)
                if quote:
                    return {
                        "taxa": quote.get("rate", 0),
                        "fee_usd": quote.get("fee", 0),
                        "eur_recebido": quote.get("receivedAmount", 0),
                        "montante_ref": amount,
                    }
    except Exception as e:
        print(f"Wise API error: {e}")
    return None


def load_config():
    config_path = Path("config.json")
    if config_path.exists():
        with open(config_path) as f:
            return json.load(f)
    return {"juro_usd_apy": 3.39, "juro_eur_apy": 1.98, "wise_montante_referencia": 5000}


# ── Main ──────────────────────────────────────────────────────

def main():
    print("A buscar dados de câmbio...")
    config = load_config()

    rates     = fetch_frankfurter(200)
    taxa_atual = rates[-1]["taxa"] if rates else None
    print(f"Taxa BCE actual: {taxa_atual}")

    amount_ref = config.get("wise_montante_referencia", 5000)
    wise = fetch_wise(
        amount_ref,
        config.get("wise_pais_origem", "GB"),
        config.get("wise_pais_destino", "DE"),
    )
    print(f"Wise ({amount_ref} USD): {wise}")

    if wise and wise["fee_usd"] and wise["montante_ref"]:
        fee_var        = (wise["fee_usd"] - 9.87) / (wise["montante_ref"] - 1000) if wise["montante_ref"] != 1000 else 0.00289
        fee_fixo       = round(9.87 - fee_var * 1000, 4)
        fee_variavel_pct = round(fee_var * 100, 4)
    else:
        fee_fixo       = 6.98
        fee_variavel_pct = 0.289

    if not rates or taxa_atual is None:
        print("ERRO CRÍTICO: sem dados de taxa. A abortar.")
        import sys; sys.exit(1)

    # Score de hoje + tracking de previsões
    acuidade = None
    score_hoje, decisao_hoje = 50, 'PARCIAL'
    try:
        with open("data/historico.json") as f:
            historico = json.load(f)
        por_janela   = historico.get("por_janela", {})
        taxas_series = [r["taxa"] for r in rates]
        hoje_date    = datetime.date.today()
        score_hoje, decisao_hoje = calcular_score(taxas_series, taxa_atual, por_janela, hoje_date)
        acuidade     = actualizar_predicoes(hoje_date, taxa_atual, score_hoje, decisao_hoje, rates)
        print(f"Score: {score_hoje} → {decisao_hoje} | Acuidade semana: {acuidade['semana']} | mês: {acuidade['mes']}")
    except Exception as e:
        print(f"Aviso: tracking de previsões falhou — {e}")

    output = {
        "updated":               datetime.date.today().isoformat(),
        "taxa_atual":            taxa_atual,
        "wise_taxa":             wise["taxa"] if wise else taxa_atual,
        "wise_fee_usd_ref":      wise["fee_usd"] if wise else None,
        "wise_eur_ref":          wise["eur_recebido"] if wise else None,
        "wise_montante_ref":     amount_ref,
        "wise_fee_fixo":         fee_fixo,
        "wise_fee_variavel_pct": fee_variavel_pct,
        "juro_usd":              config.get("juro_usd_apy", 3.39),
        "juro_eur":              config.get("juro_eur_apy", 1.98),
        "score_hoje":            score_hoje,
        "decisao_hoje":          decisao_hoje,
        "acuidade":              acuidade,
        "historico":             rates,
    }

    Path("data").mkdir(exist_ok=True)
    with open("data/latest.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"data/latest.json actualizado. Taxa: {taxa_atual} | Wise: {wise}")


if __name__ == "__main__":
    main()
