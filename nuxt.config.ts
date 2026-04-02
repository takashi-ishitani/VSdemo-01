import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2026-04-01',
  app: {
    head: {
      title: 'Graphical Nuxt Demo',
      meta: [
        { name: 'description', content: 'Hello world / button / 3D animation demo built with Nuxt' }
      ]
    }
  }
})
