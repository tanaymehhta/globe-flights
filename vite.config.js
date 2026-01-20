import { defineConfig } from 'vite'

export default defineConfig({
  // Expose env vars starting with VITE_ to the client
  envPrefix: 'VITE_',
})
