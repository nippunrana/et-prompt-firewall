/**
 * The subpath the app is served under (egnitech.com/projects/et-prompt-firewall).
 * next.config.ts imports it for `basePath`. Next.js adds basePath to <Link> and routing,
 * but NOT to fetch(): every browser-side fetch URL must start with BASE_PATH.
 */
export const BASE_PATH = "/projects/et-prompt-firewall";
