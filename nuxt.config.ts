export default defineNuxtConfig({
  compatibilityDate: "2026-08-20",
  srcDir: "app/",
  ssr: false,
  devtools: { enabled: false },
  css: ["~~/assets/css/main.css"],
  app: { head: { title: "Bloom Rush — Tap, Water, Grow!", meta: [{ name: "description", content: "A joyful plant-growing tap race for teams and events." }] } }
})
