#!/usr/bin/env python3
"""
Fetches daily USD/EUR data from Frankfurter (ECB) and Wise public API.
Runs in GitHub Actions. Updates data/latest.json.
"""
import json
import urllib.request
import urllib.parse
import datetime
from pathlib import Path


def fetch_frankfurter(days=50):
    end = datetime.date.today()
    start = end - datetime.timedelta(days=days)
    url = f"https://api.frankfurter.dev/v2/rates?from={start}&to={end}&base=USD&quotes=EUR"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    # v2 API returns a list: [{"date":..., "base":"USD", "quote":"EUR", "rate":...}, ...]
    if isinstance(data, list):
        rates = [{"data": d["date"], "taxa": round(d["rate"], 6)} for d in sorted(data, key=lambda x: x["date"])]
    else:
        # fallback for dict format
        rates = []
        for date_str, values in sorted(data.get("data", {}).items()):
            if "EUR" in values:
                rates.append({"data": date_str, "taxa": round(values["EUR"], 6)})
    return rates


def fetch_wise(amount, pais_origem="GB", pais_destino="DE"):
    params = urllib.parse.urlencode({
        "sourceCurrency": "USD",
        "targetCurrency": "EUR",
        "sendAmount": amount,
        "sourceCountry": pais_origem,
        "targetCountry": pais_destino,
    })
    url = f"https://api.wise.com/v3/comparisons/?{params}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "application/json",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        for provider in data.get("providers", []):
            if provider.get("alias") == "wise":
                quotes = provider.get("quotes", [])
                quote = next((q for q in quotes if q.get("markup", 1) == 0.0), quotes[0] if quotes else None)
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


def main():
    print("A buscar dados de câmbio...")
    config = load_config()

    rates = fetch_frankfurter(50)
    taxa_atual = rates[-1]["taxa"] if rates else None
    print(f"Taxa BCE actual: {taxa_atual}")

    amount_ref = config.get("wise_montante_referencia", 5000)
    wise = fetch_wise(
        amount_ref,
        config.get("wise_pais_origem", "GB"),
        config.get("wise_pais_destino", "DE"),
    )
    print(f"Wise ({amount_ref} USD): {wise}")

    # Fórmula de fee calibrada: $1000->$9.87, $5000->$21.43
    fee_fixo = 6.98
    fee_variavel_pct = 0.289

    output = {
        "updated": datetime.date.today().isoformat(),
        "taxa_atual": taxa_atual,
        "wise_taxa": wise["taxa"] if wise else taxa_atual,
        "wise_fee_usd_ref": wise["fee_usd"] if wise else None,
        "wise_eur_ref": wise["eur_recebido"] if wise else None,
        "wise_montante_ref": amount_ref,
        "wise_fee_fixo": fee_fixo,
        "wise_fee_variavel_pct": fee_variavel_pct,
        "juro_usd": config.get("juro_usd_apy", 3.39),
        "juro_eur": config.get("juro_eur_apy", 1.98),
        "historico": rates,
    }

    Path("data").mkdir(exist_ok=True)
    with open("data/latest.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"data/latest.json actualizado. Taxa: {taxa_atual} | Wise: {wise}")


if __name__ == "__main__":
    main()
