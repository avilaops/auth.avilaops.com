# Avaliação MLOps do Auth

O workflow `.github/workflows/mlops-auth-evaluation.yml` é um workflow
reutilizável para validar o Auth com os contratos oficiais do repositório
`avilaops/experiments`. O gatilho
`.github/workflows/mlops-auth.yml` executa essa avaliação em Pull Requests
contra `main`.

## Ativação

O chamador deve usar uma referência imutável, por exemplo:

```yaml
jobs:
  mlops-evaluation:
    uses: ./.github/workflows/mlops-auth-evaluation.yml
    with:
      experiments-ref: dfd4682b46be7df9aaa398461ae107ab52faa5d9
```

O workflow recusa branches e tags móveis. O checkout do Auth e o checkout dos
contratos usam `persist-credentials: false`, e o workflow possui somente
`contents: read`. As dependências do checkout central são instaladas com
scripts de instalação desabilitados; as dependências do Auth permanecem
isoladas no checkout principal.

## Documentos gerados

O job gera e preserva como artefato:

- `evaluation-request.json` antes da suíte;
- `evidence-envelope.json` com o hash do log da suíte;
- `evaluation-result.json` com o resultado do teste do Auth;
- `test-output.log`.

O resultado é um check do próprio job e pode ser selecionado como check
obrigatório na proteção da branch. O artefato não autoriza deploy, não altera
permissões e não substitui aprovação humana para mudanças de OIDC, MFA,
autenticação, permissões ou migrations sensíveis.

O fluxo deliberadamente não usa `workflow_run` para executar código de Pull
Request com permissões elevadas.
