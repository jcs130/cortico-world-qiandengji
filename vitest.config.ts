import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins:[{
    name:'official-cli-hashbang-in-tests',
    enforce:'pre',
    transform(code,id){
      // Vitest 2 evaluates transformed ESM inside a function. Node accepts this
      // official CLI hashbang at file start; the function wrapper does not.
      // Keep the downloaded source and its provenance hash byte-for-byte intact.
      if(id.replaceAll('\\','/').endsWith('/integrations/qiandengji/portal/agent-register.mjs')&&code.startsWith('#!'))return {code:code.replace(/^#![^\r\n]*/,'') ,map:null};
    },
  }],
  test: { include: ['tests/**/*.test.ts'] },
});
