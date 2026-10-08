# Pronta entrega — Pollo Decor

Cinco páginas, todas rodando no navegador de quem abre:

- `index.html` — o que o representante vê no celular (pronta entrega + reserva do dia)
- `gerente.html` — quem reservou, cadastro de representantes e links pessoais
- `casamento.html` — a ferramenta do PCP (anexa estoque e pedidos, publica a pronta entrega)
- `clientes.html` — carteira de clientes do representante (só os clientes do código dele; quem edita é o gerente, na aba Clientes)
- `catalogo.html` — catálogo do colaborador aberto dentro do site, com botão Voltar
- `painel.html` — Painel Executivo (vendas, faturamento e carteira), só para gerente; gerado de `agente comercial/painel_executivo/` (`python3 build2.py`)
- `metas.html` — "Minha meta" do representante (meta do mês, prêmio, placar e conquistas; só os dados dele). O placar geral fica na aba Metas do gerente
- `gestao.html` — atalho para a Gestão Comercial (metas e representantes), que fica hospedada no Claude

Dados no Supabase (projeto "Pollo Decor PCP"). Nenhuma página mostra preço.
Gerado pelo agente de PCP da Pollo Decor.
