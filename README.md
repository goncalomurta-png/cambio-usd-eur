# Projeto: Análise de Câmbio USD→EUR

Esta pasta contém os 3 ficheiros do projeto, prontos para colocar no Claude Projects (ou em qualquer pasta local):

1. **00-instrucoes-template-relatorio.md** — instruções/template a seguir sempre que se pedir um novo relatório
2. **01-analise-historica-usd-eur-2010-2024.md** — dados históricos (2010-2024), base de todas as probabilidades
3. **02-exemplo-relatorio-agosto-2025.md** — exemplo de relatório já produzido (Agosto 2025), serve de referência de formato

---

## Como colocar no Mac via terminal

Se descarregaste o ficheiro `.zip`, abre o Terminal e faz:

```bash
cd ~/Downloads
unzip projeto-cambio-usd-eur.zip -d ~/Documents/projeto-cambio-usd-eur
cd ~/Documents/projeto-cambio-usd-eur
ls -la
```

Ajusta `~/Documents/projeto-cambio-usd-eur` para o caminho onde queres guardar o projeto.

Se preferires criar a pasta primeiro e copiar os ficheiros manualmente:

```bash
mkdir -p ~/Documents/projeto-cambio-usd-eur
mv ~/Downloads/00-instrucoes-template-relatorio.md ~/Downloads/01-analise-historica-usd-eur-2010-2024.md ~/Downloads/02-exemplo-relatorio-agosto-2025.md ~/Documents/projeto-cambio-usd-eur/
```

---

## Depois de colocar no Claude Projects

1. Cria (ou abre) o Project no Claude
2. Vai a "Project knowledge" / "Conhecimento do projeto"
3. Carrega os 3 ficheiros `.md`
4. A partir daí, basta pedir um novo relatório indicando data do salário, montante em USD e um screenshot da taxa actual — o Claude segue automaticamente o template
