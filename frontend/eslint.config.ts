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
  
  // Additional configuration to prohibit default exports
  {
    plugins: {
      'import': importPlugin,
    },
    rules: {
      // Prohibit default exports in TypeScript files
      'import/no-default-export': 'error',
      
      // Disable rules that encourage default exports
      'import/prefer-default-export': 'off',
      'import/no-named-as-default': 'off',
    },
  },
  
  // Separate configuration for Vue files - allow default export
  {
    files: ['**/*.vue'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
  
  // Separate configuration for config files - allow default export
  {
    files: ['**/*.config.{js,ts}', '**/eslint.config.*', '**/vite.config.*'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
)
