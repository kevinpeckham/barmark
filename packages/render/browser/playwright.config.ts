import { defineConfig, devices } from "@playwright/test";

const PORT = 5260;

export default defineConfig({
	testDir: ".",
	testMatch: "*.pw.ts",
	timeout: 20_000,
	use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices["Desktop Chrome"] },
	webServer: {
		command: "bun server.ts",
		url: `http://127.0.0.1:${PORT}/chart`,
		env: { PORT: String(PORT) },
		reuseExistingServer: false,
	},
});
