// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  
  modules: ['@nuxtjs/tailwindcss'],
  
  css: ['~/assets/css/main.css'],
  
  // Use SPA mode for Amplify static hosting
  ssr: false,
  
  runtimeConfig: {
    // Private keys (only available on server-side)
    
    // Public keys (exposed to client-side)
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || 'https://api.pro.cachao.io',
      apiBasePath: process.env.NUXT_PUBLIC_API_BASE_PATH || '',
      /** Full app URL for QR codes (e.g. https://yourapp.com). If unset, uses window.location.origin in the browser. */
      appUrl: process.env.NUXT_PUBLIC_APP_URL || '',
      cognitoUserPoolId: process.env.NUXT_PUBLIC_COGNITO_USER_POOL_ID || 'eu-west-1_y1FDQpQ9b',
      cognitoClientId: process.env.NUXT_PUBLIC_COGNITO_CLIENT_ID || '37a41hu5u7mlm6nbh9n3d23ogb',
      cognitoRegion: process.env.NUXT_PUBLIC_COGNITO_REGION || 'eu-west-1'
    }
  },
  
  // Proxy API calls to avoid CORS issues in development
  nitro: {
    devProxy: {
      '/api': {
        target: process.env.NUXT_PUBLIC_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        prependPath: true,
      }
    }
  },
  
  // Add route rules to handle API calls client-side only
  routeRules: {
    '/api/**': { cors: true, headers: { 'Access-Control-Allow-Origin': '*' } }
  }
})

