import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'

for (const palette of ['blue', 'teal']) {
  for (const theme of ['light', 'dark']) {
    test(`${palette}/${theme}: readable controls, distinct picker states and no overflow`, async ({ page }, testInfo) => {
      await page.evaluate(() => { for (const details of document.querySelectorAll('details')) details.open = true })
      await page.getByRole('combobox', { name: 'Interface color', exact: true }).selectOption(palette)
      await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme)
      await expect(page.locator('html')).toHaveAttribute('data-accent', palette)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      const overflow = await page.locator('section').evaluateAll(nodes => nodes.some(node => node.scrollWidth > node.clientWidth + 1))
      expect(overflow).toBe(false)
      const select = page.getByRole('combobox', { name: 'Theme', exact: true })
      await select.click()
      const target = page.getByRole('option', { name: theme === 'light' ? 'Dark' : 'Light', exact: true })
      await target.hover()
      const selected = await select.locator('option:checked').evaluate(node => getComputedStyle(node).backgroundColor)
      const hovered = await target.evaluate(node => getComputedStyle(node).backgroundColor)
      expect(selected).not.toBe(hovered)
      await testInfo.attach('picker', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
      await page.keyboard.press('Escape')
    })
  }
}

test('palette persists across reopening and follows browser light/dark changes', async ({ page }) => {
  await page.getByText('Settings', { exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Interface color', exact: true })).toHaveValue('blue')
  await page.getByRole('combobox', { name: 'Interface color', exact: true }).selectOption('teal')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'browser')
  const backgrounds = []
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    backgrounds.push(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor))
    expect(await page.evaluate(() => popupFixture.store.accentPalette)).toBe('teal')
  }
  expect(backgrounds[0]).not.toBe(backgrounds[1])
})

test('palette picker supports keyboard navigation and retains its selection', async ({ page }) => {
  await page.getByText('Settings', { exact: true }).click()
  const palette = page.getByRole('combobox', { name: 'Interface color', exact: true })
  await palette.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(palette).toHaveValue('teal')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')
})

test('snapshot notice survives acknowledgment only until the popup reopens', async ({ page }) => {
  await page.getByText('Settings', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Notify about new snapshot revisions' }).check()
  await expect.poll(() => page.evaluate(() => popupFixture.store.snapshotRevisionsSeen?.snapshot)).toBe('100')
  await page.evaluate(async () => {
    const versions = structuredClone(popupFixture.store.versions)
    versions.win64[0].revision = '101'
    await popupFixture.set({ versions })
  })
  await expect(page.locator('.revision-update-label')).toHaveText('New')
  await expect.poll(() => page.evaluate(() => popupFixture.store.snapshotRevisionsSeen.snapshot)).toBe('101')
  await expect(page.locator('.revision-update-label')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.revision-update-label')).toHaveCount(0)
})

test('failed manual check keeps cached updates and wraps long errors; later success clears it', async ({ page }) => {
  await page.evaluate(async () => {
    const versions = structuredClone(popupFixture.store.versions)
    versions.win64[0].version = '999.0.0.0'
    await popupFixture.set({ versions })
  })
  const check = page.getByRole('button', { name: 'Check now for updates', exact: true })
  await check.click()
  await expect(page.getByRole('button', { name: 'Checking… for updates', exact: true })).toBeDisabled()
  await page.evaluate(() => popupFixture.completeCheck('Chromatic Feed timed out after 15000 ms: ' + 'verylongnetworkerror'.repeat(30)))
  await expect(check).toBeEnabled()
  await expect(page.locator('.chromium-status__history .error-text')).toContainText('timed out')
  await expect(page.locator('.chromium-status code.badge')).toHaveText('v999.0.0.0')
  expect(await page.locator('section').evaluateAll(nodes => nodes.some(node => node.scrollWidth > node.clientWidth + 1))).toBe(false)
  await check.click()
  await page.evaluate(() => popupFixture.completeCheck())
  await expect(check).toBeEnabled()
  await expect(page.locator('.chromium-status__history .error-text')).toHaveCount(0)
})

test('missing build selection keeps status and manual check available', async ({ page }) => {
  await page.evaluate(() => popupFixture.set({ tag: null }))
  await expect(page.getByText('Choose a Chromium build in Settings to track updates.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check now for updates', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /^Tag\b/ })).toBeVisible()
})
