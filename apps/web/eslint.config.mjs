import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts']),
  {
    rules: {
      // Adoption progressive : ces règles (nouvelles dans eslint-config-next 16)
      // signalent des patterns préexistants dans tout le code. Elles restent
      // visibles en avertissements en CI sans casser la branche, le temps de
      // les corriger une par une ; toute autre règle reste bloquante.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react/jsx-no-comment-textnodes': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])
