/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.sql" {
  const sql: string;
  export default sql;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_VERSION?: string;
}
