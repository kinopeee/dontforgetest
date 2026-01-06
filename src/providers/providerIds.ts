/**
 * Provider 実装間で共有する識別子/定数。
 *
 * NOTE:
 * - 設定（AgentProviderId）は camelCase（例: devinApi）
 * - Provider 実装の runtime id は kebab-case（例: devin-api）
 */

/** Devin API の Provider runtime id（kebab-case） */
export const DEVIN_API_PROVIDER_ID = 'devin-api';

/** Devin API Key の環境変数名 */
export const DEVIN_API_KEY_ENV = 'DEVIN_API_KEY';

