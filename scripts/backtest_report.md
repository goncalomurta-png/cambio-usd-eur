# Backtest de Validação — Score USD→EUR

**Gerado em:** 2026-07-01  
**Fonte de dados:** BCE via Frankfurter.dev (descarregado em 2026-07-01), 4200 observações  
**Período analisado:** 2015-03-02 → 2026-07-01  
**Total de dias com dados:** 4140  
**Flexibilidade (backtest):** 15 dias  
**Warmup:** 60 dias  

## 1. Acuidade do Score

### AGUARDAR (score ≥ 65)
- **N** de dias classificados: 322
- Taxa subiu em +7d:  **51.7%** (321 obs) — variação média -0.023%
- Taxa subiu em +15d: **52.3%** (321 obs) — variação média -0.053%
- Taxa subiu em +30d: **49.8%** (321 obs) — variação média -0.162%

> Referência aleatória: 50%. Acima de 55% indica sinal útil.

### CONVERTER (score ≤ 35)
- **N** de dias classificados: 663
- Taxa desceu em +7d:  **50.8%** (663 obs) — variação média -0.065%
- Taxa desceu em +15d: **53.7%** (663 obs) — variação média -0.123%
- Taxa desceu em +30d: **51.1%** (663 obs) — variação média -0.103%

### Distribuição de recomendações
| Recomendação | N | % |
|---|---|---|
| AGUARDAR  | 322  | 7.8% |
| PARCIAL   | 3155   | 76.2% |
| CONVERTER | 663 | 16.0% |
| **Total** | **4140** | 100% |

## 2. Score-to-Outcome (correlação score vs variação real +7d)

**Correlação de Pearson score↔variação +7d:** +0.0332

> Correlação negligenciável — score praticamente sem poder preditivo a 7 dias.

### Variação média real por decil de score

| Decil de score | Variação média +7d |
|---|---|
| 10-19 | +0.4296% |
| 20-29 | -0.0713% |
| 30-39 | -0.0540% |
| 40-49 | -0.0419% |
| 50-59 | +0.0599% |
| 60-69 | +0.0068% |
| 70-79 | +0.0513% |
| 80-89 | +1.1622% |

> Esperado: decis altos (score≥70) devem ter variação positiva; decis baixos (score≤30) devem ter variação negativa.

## 3. Análise do RSI

### RSI > 70 (sobrecomprado — sinal de venda/converter)
- N de ocorrências: 621
- Taxa desceu em +7d:  **50.6%** (617 obs) — variação média -0.013%
- Taxa desceu em +15d: **55.0%** (611 obs) — variação média -0.104%

### RSI < 30 (sobrevendido — sinal de espera/aguardar)
- N de ocorrências: 591
- Taxa subiu em +7d:  **51.4%** (591 obs) — variação média -0.000%
- Taxa subiu em +15d: **53.0%** (591 obs) — variação média +0.066%

## 4. Poder Preditivo dos Fluxos Mensais

### Janelas de alto fluxo (prob_atual ≥ 30%)
- N de dias: 1518
- Taxa subiu em +7d:  **48.7%** (1518 obs) — variação média -0.008%
- Taxa subiu em +15d: **45.5%** (1518 obs) — variação média -0.087%

### Janelas de baixo fluxo (prob_atual < 15%)
- N de dias: 571
- Taxa subiu em +7d:  **52.5%** (571 obs) — variação média +0.038%
- Taxa subiu em +15d: **50.4%** (571 obs) — variação média +0.018%

**Correlação prob_atual ↔ variação +7d:** -0.0308

> Correlação negligenciável — fluxos mensais históricos não têm poder preditivo sobre a taxa nos 7 dias seguintes.

## 5. Calibração do Cone de Volatilidade

- N de dias testados: 4133
- Dentro ±1σ√7: **52.0%** (esperado ≈68.3%)
- Dentro ±2σ√7: **80.9%** (esperado ≈95.4%)

> **Sub-estimação severa de volatilidade** — o cone é demasiado estreito (fat tails não capturadas).
> **±2σ também sub-estimado** — a distribuição de retornos tem caudas mais pesadas do que a normal (leptocúrtica).

## 6. Recomendações de Melhoria

### Fluxos Mensais (prob_atual)
- **Poder preditivo negligenciável.** A probabilidade histórica BCE por janela de 5 dias não tem correlação mensurável com a variação real da taxa nos 7 dias seguintes.
- **Recomendação:** Reduzir o peso deste indicador no score de 40pp para ≤15pp, ou convertê-lo num filtro secundário em vez de factor primário.
- A metodologia top-25% por janela de 5 dias pode estar a capturar ruído histórico em vez de padrão genuíno.

### RSI
- RSI fraco neste par: sobrecomprado→desceu apenas 51% (esperado >60%); sobrevendido→subiu 51%.
- **Recomendação:** Reduzir peso do RSI de ±10pp para ±5pp, ou usar período mais curto (RSI-7 em vez de RSI-14).
- USD/EUR é influenciado principalmente por diferenciais de taxa BCE/Fed — RSI pode ser menos fiável que em acções.

### Cone de Volatilidade
- **Cone sub-estimado:** 52.0% dentro ±1σ vs esperado 68.3%.
- **Recomendação:** Aplicar multiplicador de expansão de ~1.3-1.5× à volatilidade diária no cone.
- Alternativa: usar volatilidade EWMA (pesos exponenciais) em vez de desvio-padrão simples dos últimos 20 dias.

### Score-to-Outcome
- **Correlação score↔variação +7d quase nula (+0.0332).** O score actual não prevê consistentemente a direcção da taxa.
- **Recomendação prioritária:** Rever a fórmula de score — especialmente o peso dos fluxos mensais (até 40pp) que parece dominar o score sem poder preditivo real.
- Considerar basear o score principalmente em RSI + MACD + Bollinger (indicadores técnicos com fundamento matemático) e tratar fluxos como factor de ajuste secundário.

### Melhorias Adicionais Recomendadas

1. **Diferencial de taxas BCE/Fed em tempo real:** O factor mais determinante do USD/EUR nos últimos anos é a diferença entre a taxa directora do Fed e do BCE. Incorporar este diferencial directamente no score (ex: Fed rate − BCE rate > 1pp → pressão para USD forte).
2. **Tendência de médio prazo (MA50 vs MA200):** Filtrar os sinais de curto prazo com a tendência macro. Se USD está em tendência de baixa a 200 dias, sinal de AGUARDAR merece mais peso.
3. **Volatilidade adaptativa:** Usar janela de volatilidade mais curta (10 dias) quando mercado está em stress (vol > percentil 80 histórico).
4. **Backtesting com custo de oportunidade:** Incorporar o diferencial de juros USD/EUR — esperar tem custo real diário quando juro USD > juro EUR.

---
*Relatório gerado por `scripts/backtest.py` em 2026-07-01 11:32*