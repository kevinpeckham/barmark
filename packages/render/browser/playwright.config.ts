import { defineConfig, devices } from "@playwright/test";

const PORT = 5260;

export default defineConfig({
	testDir: ".",
	testMatch: "*.pw.ts",
	timeout: 20_000,
	use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"] },
	webServer: {
		command: "bun server.ts",
		url: `http://localhost:${PORT}/chart`,
		env: { PORT: String(PORT) },
		reuseExistingServer: false,
	},
});
