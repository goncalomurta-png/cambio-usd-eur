# 📋 Instruções para Elaborar Relatório de Análise de Câmbio USD→EUR

## 🎯 Objectivo
Gerar um relatório personalizado em markdown que analisa a melhor estratégia de conversão USD→EUR baseado em dados históricos (2010-2024) e situação actual do mercado.

---

## 📚 Documentos Necessários

### 1. Análise Estatística Completa USD→EUR (Obrigatório)
- **Ficheiro:** `01-analise-historica-usd-eur-2010-2024.md`
- **Conteúdo:** Dados históricos completos com probabilidades por dia e janela temporal
- **Utilização:** Base para todas as comparações históricas e probabilidades

### 2. Screenshot da Taxa Actual (Obrigatório)
- **Fonte:** xe.com, wise.com, ou similar
- **Formato:** Imagem mostrando:
  - Taxa USD→EUR actual
  - Data e hora da consulta
  - Gráfico dos últimos 20-30 dias (se disponível)
- **Exemplo:** "1 USD = 0.855931 EUR Aug 28, 2025, 14:15 UTC"

### 3. Template Base (Este documento)
- **Função:** Estrutura a ser seguida em cada novo relatório

---

## 📝 Inputs Necessários do Utilizador

**Informação Básica:**
- Data de recebimento do salário (formato: DD/MM/AAAA)
- Montante em USD (ex: $6.600)
- Screenshot actual da taxa (como descrito acima)

---

## 🔧 Processo de Elaboração

### Passo 1: Configuração Inicial
```
Data de Recebimento do Salário: [Data fornecida]
Montante USD: [Valor fornecido]
Taxa Actual: [Extrair do screenshot]
```

### Passo 2: Análise Temporal
- **Determinar janela actual:**
  - Extrair dia do mês da data fornecida
  - Classificar em janela (1-5, 6-10, 11-15, 16-20, 21-25, 26-31)
- **Consultar dados históricos:**
  - Usar a análise histórica para probabilidades específicas
  - Identificar melhor/pior janela do mês
  - Comparar probabilidade actual vs óptima

### Passo 3: Análise de Tendência (Crítica)
- **Padrão histórico esperado:**
  - Consultar probabilidades diárias dos últimos 20 dias no documento histórico
  - Identificar padrão esperado (estável/subida/descida)
- **Tendência actual observada:**
  - Analisar gráfico do screenshot
  - Comparar tendência real vs padrão histórico
  - Identificar divergências ou confirmações

### Passo 4: Geração da Recomendação
**Critérios de decisão:**
- **CONVERTER AGORA:** Janela óptima + tendência favorável
- **AGUARDAR:** Janela desfavorável + próxima óptima próxima
- **CONVERSÃO PARCIAL:** Janela média + incerteza na tendência

### Passo 5: Validação Cruzada
- **Histórico:** Probabilidade da janela actual
- **Padrão:** Conformidade com tendência esperada
- **Anomalia:** Identificação de desvios significativos

---

## 📊 Elementos-Chave a Incluir

### Secção 1: Configuração e Recomendação Principal
- Data, montante, taxa actual
- Recomendação clara (CONVERTER/AGUARDAR/PARCIAL)
- Justificação baseada em validação múltipla

### Secção 2: Plano de Acção (4 pontos obrigatórios)
1. Hoje: Acção específica baseada na análise
2. Próximos 3 dias: Estratégia de monitorização
3. Próxima janela óptima: Data e critérios
4. Avaliação últimos 20 dias: Comparação histórico vs actual

### Secção 3: Análise da Taxa vs Histórico
- Tabela comparativa detalhada
- Identificação de divergências críticas
- Conclusões sobre conformidade com padrões

### Secção 4: Análise Temporal
- Situação actual vs próxima óptima
- Probabilidades e ranking de janelas
- Cronograma específico

### Secção 5: Estratégia Personalizada
- Montantes específicos por cenário
- Critérios de decisão ajustados
- Gestão de risco contextualizada

### Secção 6: Dados Históricos Contextualizados
- Probabilidades específicas do mês
- Comparação por janelas
- Legenda de interpretação

---

## ⚠️ Pontos Críticos de Atenção

### 1. Análise de Tendência Correcta
- NÃO comparar apenas valores absolutos
- FOCAR na tendência (subida/descida) dos últimos 20 dias
- Comparar tendência actual vs padrão histórico esperado para o mesmo período

### 2. Validação Múltipla
- Sempre confirmar recomendação com pelo menos 2 fontes (histórico + actual)
- Identificar quando padrões são violados
- Ajustar recomendações conforme anomalias

### 3. Especificidade Temporal
- Usar dados exactos do documento histórico
- Não generalizar — usar probabilidades específicas por dia quando disponível
- Considerar sazonalidade e padrões mensais

### 4. Contextualização da Taxa
- Ajustar metas de taxa conforme contexto actual
- Considerar volatilidade observada
- Adaptar critérios se mercado apresentar anomalias

---

## 📋 Checklist de Qualidade

**Antes de Finalizar, Verificar:**
- [ ] Recomendação clara e justificada
- [ ] Probabilidades correctas do documento histórico
- [ ] Análise de tendência (não valores absolutos)
- [ ] Plano de acção com 4 pontos específicos
- [ ] Critérios de decisão adaptados ao contexto
- [ ] Identificação de padrões violados (se aplicável)
- [ ] Cronograma específico com datas
- [ ] Gestão de risco contextualizada

**Validação Final:**
- [ ] Dados históricos consultados correctamente
- [ ] Screenshot analisado para tendência
- [ ] Recomendação alinhada com validação múltipla
- [ ] Linguagem clara e accionável
- [ ] Todos os campos "[A preencher]" substituídos

---

## 🔍 Exemplo de Prompt para Elaboração

```
Usando o documento "Análise Estatística Completa USD→EUR" e o screenshot fornecido,
elabora um relatório de análise de câmbio para:

- Data: [data]
- Montante: [valor] USD
- Screenshot: [descrever taxa e tendência observada]

Foca especialmente na comparação da tendência dos últimos 20 dias vs padrão histórico
esperado para o mesmo período. Usa as probabilidades específicas por dia do documento
histórico para validação.
```

---

## 📖 Recursos de Referência

**Documentos Base:**
- `01-analise-historica-usd-eur-2010-2024.md`
- `00-instrucoes-template-relatorio.md` (este documento)
- `02-exemplo-relatorio-agosto-2025.md` (exemplo de relatório já produzido)
- Screenshot da taxa actual (fornecido pelo utilizador em cada novo pedido)

**Fontes Recomendadas para Screenshots:**
- xe.com (mais completo)
- wise.com (taxa real)
- ecb.europa.eu (oficial)

**Formato Final:**
- Markdown simples
- Tabelas em formato markdown
- Sem código HTML
- Focado na accionabilidade
