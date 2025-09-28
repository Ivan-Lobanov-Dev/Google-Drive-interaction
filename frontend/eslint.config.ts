import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import importPlugin from 'eslint-plugin-import'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
  
  // Дополнительная конфигурация для запрета дефолтных экспортов
  {
    plugins: {
      'import': importPlugin,
    },
    rules: {
      // Запрет дефолтных экспортов в TypeScript файлах
      'import/no-default-export': 'error',
      
      // Отключение правил, которые поощряют дефолтные экспорты
      'import/prefer-default-export': 'off',
      'import/no-named-as-default': 'off',
    },
  },
  
  // Отдельная конфигурация для Vue файлов - разрешить default export
  {
    files: ['**/*.vue'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
  
  // Отдельная конфигурация для конфигурационных файлов - разрешить default export
  {
    files: ['**/*.config.{js,ts}', '**/eslint.config.*', '**/vite.config.*'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
)
