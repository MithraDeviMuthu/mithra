/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        "bg-page": "var(--bg-page)",
        "bg-card": "var(--bg-card)",
        "bg-card-alt": "var(--bg-card-alt)",
        "bg-nav": "var(--bg-nav)",
        border: "var(--border)",
        accent: {
          DEFAULT: "var(--accent)",
          1: "var(--accent-dark-1)",
          2: "var(--accent-dark-2)",
          3: "var(--accent-dark-3)",
          4: "var(--accent-dark-4)",
        },
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
          text: "var(--success-text)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          bg: "var(--danger-bg)",
          text: "var(--danger-text)",
        },
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};
