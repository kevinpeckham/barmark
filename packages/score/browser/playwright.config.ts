import { defineConfig, devices } from "@playwright/test";

const PORT = 5261;

export default defineConfig({
	testDir: ".",
	testMatch: "*.pw.ts",
	timeout: 30_000,
	use: { baseURL: `http://127.0.0.1:${PORT}` },
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		// The loading tests run in every engine in CI; the rest stay in Chromium.
		...(process.env.SCORE_BROWSERS === "all"
			? [
					{
						name: "firefox",
						use: { ...devices["Desktop Firefox"] },
						grep: /@loading /,
					},
					{
						name: "webkit",
						use: { ...devices["Desktop Safari"] },
						grep: /@loading /,
					},
				]
			: []),
	],
	webServer: {
		command: "bun server.ts",
		url: `http://127.0.0.1:${PORT}/score`,
		env: { PORT: String(PORT) },
		reuseExistingServer: false,
	},
});
