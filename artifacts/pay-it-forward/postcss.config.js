// Tailwind v4 is handled by @tailwindcss/vite plugin, not PostCSS.
// This empty config prevents Vite from walking up and finding the root
// project's postcss.config.js which loads Tailwind v3 and conflicts.
export default {};
