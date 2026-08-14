export {};

declare global {
  interface Window {
    openNia?: (prompt?: string) => void;
  }
}