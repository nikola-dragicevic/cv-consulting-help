import { chromium } from "playwright-core"

function resolveChromiumExecutablePath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)

  return candidates[0] ?? undefined
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle" })
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
