#!/usr/bin/env python3
"""
Recalcula probabilidades históricas USD/EUR com dados reais BCE via Frankfurter.
Cobre 1999-01-04 até hoje (~27 anos, ~7000 observações).
Substitui o ficheiro data/historico.json com dados precisos.
"""
import json
import urllib.request
import datetime
from pathlib import Path
from collections import defaultdict


MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
         'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

JANELAS = [
    ('1-5',   1,  5),
    ('6-10',  6, 10),
    ('11-15', 11, 15),
    ('16-20', 16, 20),
    ('21-25', 21, 25),
    ('26-31', 26, 31),
]

# Datas de reuniões Fed e BCE — actualizar anualmente
CALENDARIO_MACRO = {
    "fed_2026": [
        "2026-01-28", "2026-03-18", "2026-05-06",
        "2026-06-17", "2026-07-29", "2026-09-16",
        "2026-11-04", "2026-12-16"
    ],
    "bce_2026": [
        "2026-01-30", "2026-03-05", "2026-04-16",
        "2026-06-04", "2026-07-23", "2026-09-10",
        "2026-10-29", "2026-12-17"
    ],
    "fed_2027": [
        "2027-01-27", "2027-03-17", "2027-05-05",
        "2027-06-16", "2027-07-28", "2027-09-15",
        "2027-11-03", "2027-12-15"
    ],
    "bce_2027": [
        "2027-01-21", "2027-03-04", "2027-04-22",
        "2027-06-03", "2027-07-22", "2027-09-09",
        "2027-10-28", "2027-12-16"
    ]
}


def fetch_chunk(start: str, end: str) -> list[dict]:
    """Busca taxas diárias USD/EUR para um intervalo via Frankfurter v2."""
    url = f"https://api.frankfurter.dev/v2/rates?from={start}&to={end}&base=USD&quotes=EUR"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "application/json",
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    if isinstance(data, list):
        return [{"data": d["date"], "taxa": d["rate"]} for d in data]
    return []


def fetch_all_history() -> list[dict]:
    """Descarrega todo o histórico BCE em chunks de 1 ano para evitar timeout."""
    todos = []
    # BCE publica EUR a partir de 1999-01-04
    ano_inicio = 1999
    ano_fim = datetime.date.today().year

    for ano in range(ano_inicio, ano_fim + 1):
        start = f"{ano}-01-01"
        end   = f"{ano}-12-31" if ano < ano_fim else datetime.date.today().isoformat()
        try:
            chunk = fetch_chunk(start, end)
            todos.extend(chunk)
            print(f"  {ano}: {len(chunk)} dias")
        except Exception as e:
            print(f"  {ano}: ERRO — {e}")

    # Remove duplicados e ordena
    vistos = set()
    unicos = []
    for d in sorted(todos, key=lambda x: x["data"]):
        if d["data"] not in vistos:
            vistos.add(d["data"])
            unicos.append(d)

    print(f"\nTotal: {len(unicos)} observações ({unicos[0]['data']} → {unicos[-1]['data']})")
    return unicos


def get_janela(dia: int) -> str:
    for nome, ini, fim in JANELAS:
        if ini <= dia <= fim:
            return nome
    return '26-31'


def calcular_probabilidades(rates: list[dict]) -> dict:
    """
    Probabilidade correcta: threshold anual (top 25% das taxas de cada ano),
    depois por janela (mês × 5 dias) calcular % de dias que estão acima desse threshold.

    Pergunta respondida: "Para uma janela (mês, dias), em que % dos anos históricos
    a taxa nessa janela estava no quartil superior das taxas desse ano?"
    """
    # Agrupar taxas por ano
    por_ano: dict[int, list[float]] = defaultdict(list)
    for r in rates:
        ano = int(r["data"][:4])
        por_ano[ano].append(r["taxa"])

    # Threshold anual: percentil 75 de cada ano
    thresh_anual: dict[int, float] = {}
    for ano, taxas in por_ano.items():
        taxas_ord = sorted(taxas)
        idx = int(len(taxas_ord) * 0.75)
        thresh_anual[ano] = taxas_ord[idx]

    # Para cada dia, marcar se está no top 25% do seu ano
    contadores: dict[tuple, dict] = defaultdict(lambda: {"top": 0, "total": 0})
    for r in rates:
        d   = datetime.date.fromisoformat(r["data"])
        ano = d.year
        mes = d.month - 1
        jan = get_janela(d.day)
        key = (mes, jan)
        thresh = thresh_anual.get(ano)
        if thresh is not None:
            contadores[key]["total"] += 1
            if r["taxa"] >= thresh:
                contadores[key]["top"] += 1

    por_janela: dict[str, dict[str, float]] = {}
    for mes_idx, mes_nome in enumerate(MESES):
        por_janela[mes_nome] = {}
        for jan_nome, _, _ in JANELAS:
            key  = (mes_idx, jan_nome)
            cnts = contadores.get(key, {"top": 0, "total": 1})
            prob = round(cnts["top"] / max(cnts["total"], 1) * 100, 1)
            por_janela[mes_nome][jan_nome] = prob

    return por_janela


def calcular_por_dia(rates: list[dict]) -> dict:
    """
    Probabilidade por dia exacto do mês usando mesmo método: threshold anual.
    """
    por_ano: dict[int, list[float]] = defaultdict(list)
    for r in rates:
        por_ano[int(r["data"][:4])].append(r["taxa"])

    thresh_anual: dict[int, float] = {}
    for ano, taxas in por_ano.items():
        taxas_ord = sorted(taxas)
        thresh_anual[ano] = taxas_ord[int(len(taxas_ord) * 0.75)]

    contadores: dict[tuple, dict] = defaultdict(lambda: {"top": 0, "total": 0})
    for r in rates:
        d     = datetime.date.fromisoformat(r["data"])
        key   = (d.month - 1, d.day)
        thresh = thresh_anual.get(d.year)
        if thresh is not None:
            contadores[key]["total"] += 1
            if r["taxa"] >= thresh:
                contadores[key]["top"] += 1

    por_dia: dict[str, list] = {}
    for mes_idx, mes_nome in enumerate(MESES):
        probs = []
        for dia in range(1, 32):
            key  = (mes_idx, dia)
            cnts = contadores.get(key, {"top": 0, "total": 0})
            if cnts["total"] >= 5:
                probs.append(round(cnts["top"] / cnts["total"] * 100, 1))
            else:
                probs.append(None)
        por_dia[mes_nome] = probs

    return por_dia


def calcular_sazonal(por_janela: dict) -> dict:
    """Resumo sazonal: melhor janela por estação."""
    estacoes = {
        "Inverno":   ["Dez", "Jan", "Fev"],
        "Primavera": ["Mar", "Abr", "Mai"],
        "Verão":     ["Jun", "Jul", "Ago"],
        "Outono":    ["Set", "Out", "Nov"],
    }
    resultado = {}
    for estacao, meses in estacoes.items():
        totais: dict[str, list] = defaultdict(list)
        for mes in meses:
            for jan, prob in por_janela.get(mes, {}).items():
                totais[jan].append(prob)
        medias = {jan: round(sum(vs) / len(vs), 1) for jan, vs in totais.items()}
        melhor = max(medias, key=lambda k: medias[k])
        resultado[estacao] = {"meses": meses, "melhor_janela": melhor, "probabilidades": medias}
    return resultado


def main():
    print("A descarregar histórico BCE (1999 → hoje)...")
    rates = fetch_all_history()

    if len(rates) < 1000:
        print("ERRO: dados insuficientes para análise fiável")
        return

    print("\nA calcular probabilidades por janela...")
    por_janela = calcular_probabilidades(rates)

    print("A calcular probabilidades por dia exacto...")
    por_dia = calcular_por_dia(rates)

    print("A calcular resumo sazonal...")
    sazonal = calcular_sazonal(por_janela)

    # Estatísticas dos dados
    inicio = rates[0]["data"]
    fim    = rates[-1]["data"]
    anos   = round(len(rates) / 252, 1)  # ~252 dias úteis por ano

    output = {
        "fonte": f"BCE via Frankfurter.dev · {inicio} → {fim}",
        "observacoes": len(rates),
        "anos": anos,
        "metodologia": "top 25% das taxas USD/EUR por período analisado",
        "por_janela": por_janela,
        "por_dia": por_dia,
        "sazonal": sazonal,
        "calendario_macro": CALENDARIO_MACRO,
    }

    Path("data").mkdir(exist_ok=True)
    with open("data/historico.json", "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n✓ data/historico.json gerado com {len(rates)} observações ({anos} anos)")
    print("\nPreview por_janela (Jun):")
    for j, p in por_janela.get("Jun", {}).items():
        print(f"  {j}: {p}%")


if __name__ == "__main__":
    main()
