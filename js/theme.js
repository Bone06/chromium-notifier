const validThemes = new Set(['browser', 'dark', 'light'])
const validAccents = new Set(['blue', 'teal'])

const applyTheme = themeMode => {
  document.documentElement.dataset.theme = validThemes.has(themeMode)
    ? themeMode
    : 'browser'
}

const applyAccent = accentPalette => {
  document.documentElement.dataset.accent = validAccents.has(accentPalette)
    ? accentPalette
    : 'blue'
}

chrome.storage.local.get(['themeMode', 'accentPalette'], ({ themeMode, accentPalette }) => {
  applyTheme(themeMode)
  applyAccent(accentPalette)
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.themeMode) {
    applyTheme(changes.themeMode.newValue)
  }
  if (areaName === 'local' && changes.accentPalette) {
    applyAccent(changes.accentPalette.newValue)
  }
})
