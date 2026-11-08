import { defineConfig, devices } from "@playwright/test";

const PORT = 5261;

export default defineConfig({
	testDir: ".",
	testMatch: "*.pw.ts",
	timeout: 30_000,
	use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"] },
	webServer: {
		command: "bun server.ts",
		url: `http://localhost:${PORT}/score`,
		env: { PORT: String(PORT) },
		reuseExistingServer: false,
	},
});
