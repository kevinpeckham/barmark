import { defineConfig, devices } from "@playwright/test";

const PORT = 5270;

export default defineConfig({
	testDir: ".",
	testMatch: "*.pw.ts",
	timeout: 20_000,
	use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"] },
	webServer: {
		command: `bun run build && bunx vite preview --port ${PORT} --strictPort`,
		cwd: "..",
		url: `http://localhost:${PORT}/`,
		timeout: 120_000,
		reuseExistingServer: false,
	},
});
