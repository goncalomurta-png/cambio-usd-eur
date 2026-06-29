# Plano de Execução — Auditoria Câmbio USD→EUR

## CRÍTICO

- [x] **C1** — MACD: reescrito com `calcularEMASeries` (uma passagem); alinha fast/slow pelo fim, EMA-9 da série MACD → `js/analise.js`
- [x] **C2** — Histórico alargado: `fetch_frankfurter(200)` → `scripts/fetch_data.py`
- [x] **C3** — Removida chamada CORS Wise (sempre bloqueada); usa sempre estimativa → `js/analise.js`
- [x] **C4** — Timezone: `getUTCMonth()` / `getUTCDate()` → `js/analise.js`

## IMPORTANTE

- [x] **I1** — RSI: warm-up sobre série completa (loop desde i=1 até prices.length) → `js/analise.js`
- [x] **I2** — Score: RSI/MACD/Bollinger agrupados num bucket com cap ±20 → `js/analise.js`
- [x] **I3** — "Próxima óptima": gap mínimo de 3pp (era +0.1pp) → `js/analise.js`
- [x] **I4** — Validação: throw se historico < 30 dias ou taxaAtual null → `js/analise.js`
- [x] **I5** — Python: `sys.exit(1)` se rates vazio → `scripts/fetch_data.py`
- [x] **I6** — Fee Wise: recalibração dinâmica da API → `scripts/fetch_data.py`
- [x] **I7** — Break-even: nota de rodapé com premissas (juro simples, APY usado) → `js/relatorio.js`
- [x] **I8** — Aviso visual ⚠️ laranja quando dados > 1 dia de atraso → `js/analise.js` + `css/style.css`
- [ ] **I9** — Calendário macro hardcoded a 2026; sem fallback para 2027+ → `data/historico.json`
- [x] **I10** — Nota metodologia: "padrão sazonal, não previsão" no UI → `js/relatorio.js`

## MELHORIA

- [x] **M1** — Helper `eurAtaxa(taxa, fee, montante)` centralizado em `js/analise.js`
- [x] **M2** — Thresholds RSI: 68/32 → 70/30 (analise.js + relatorio.js)
- [x] **M3** — Thresholds Bollinger: 85%/15% → 80%/20% (analise.js + relatorio.js)
- [x] **M4** — Zona PARCIAL alargada: 40-60 → 35-65 → `js/analise.js`
- [x] **M5** — Guard `melhorEntry?.[1] ?? 1` já presente via `||`

## NOVAS FUNCIONALIDADES (confirmadas para execução)

- [ ] **N1** — Distribuição de probabilidade da espera (% hipótese taxa subir X% em Y dias)
- [ ] **N2** — Arquivo de relatórios: guardar cada análise com timestamp em localStorage
- [ ] **N3** — Alerta visual: botão "Definir alerta de taxa" com notificação browser quando taxa atingir target
- [x] **N4** — Estratégias parciais 25/50/75% com EUR calculado — visível em CONVERSÃO PARCIAL → `js/relatorio.js`
- [ ] **N5** — Adicionar calendário macro 2027 e mecanismo de actualização anual

---

**Histórico recalculado:** ✅ 10.013 observações BCE 1999-2026 (`data/historico.json`)

**Pendentes:** I9, N1, N2, N3, N5
